const { ipcRenderer } = require('electron');
const { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Legend, Title, Tooltip } = require('chart.js');
const fs = require('fs');
const path = require('path');

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Legend, Title, Tooltip);

// let dataToSend = [0, 0, 0, 0, 0, 0]; 
// const characters = ['A', 'B', 'C', 'D', 'E', 'F'];
// let character;
const charts = [];
let csvData = {
    chart1: [],
    chart2: [],
    chart3: []
};

let isPortOpen = false;
let multipliers = {
    channel1: [1,2,3,4,5,6,7,8,9,10],
    channel2: [1,2,3,4,5,6,7,8,9,10],
    channel3: [1,2,3,4,5,6,7,8,9,10]
};

let isPlotting = { channel1: false, channel2: false, channel3: false };
let serialDataBuffer = { channel1: [], channel2: [], channel3: [] };

let currentMultipliers = { channel1: 1, channel2: 1, channel3: 1 };
let activeButton = { channel1: null, channel2: null, channel3: null };

// function sendData() {
//     // This function sends data continuously every 100ms
//     const characterToSend = character;
//     if (characterToSend &&  (characterToSend == 'A' || characterToSend == 'a')) {
//         ipcRenderer.send('send-to-arduino', characterToSend);
//         console.log("Sent: ", characterToSend);
//     } 
// }
function downloadAllGraphsCSV() {
    // Assuming all charts have the same number of data points and labels
    if (charts.length === 0 || charts[0].data.labels.length === 0) {
        console.error('No data to download');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    let maxLength = Math.max(...Object.values(csvData).map(arr => arr.length));
    
    // Add header row - Time, Graph 1, Graph 2, ...
    let headerRow = "Time,";
    headerRow += charts.map((_, index) => `Graph ${index + 1}`).join(',');
    csvContent += headerRow + "\n";

    // Add data rows
    for (let i = 0; i < maxLength; i++) {
        let row = `${i},`; // Replace with actual timestamp or index if available
        Object.keys(csvData).forEach((key, index, array) => {
            row += csvData[key][i] !== undefined ? csvData[key][i] : "";
            if (index < array.length - 1) {
                row += ",";
            }
        });
        csvContent += row + "\n";
    }

    // Encode and create a link to download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "all_graphs_data.csv");
    document.body.appendChild(link);

    // Trigger download and remove link
    link.click();
    document.body.removeChild(link);
}

function resetAndUpdateChart(chart, channel, value) {
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update();
}

function updateChartScales(chart, data) {
    let minValue = Math.min(...data);
    let maxValue = Math.max(...data);
    chart.options.scales.y.min = minValue - (0.1 * Math.abs(minValue));
    chart.options.scales.y.max = maxValue + (0.1 * Math.abs(maxValue));
}

function updateButtonColors(activeChannel, activeButtonIndex) {
    for (let j = 1; j <= 10; j++) {
        const button = document.getElementById(`${activeChannel}button${j}`);
        if (j === activeButtonIndex) {
            button.classList.add('button-active');
        } else {
            button.classList.remove('button-active');
        }
    }
}

function updateContainerWidth() {
    const container = document.querySelector('.container');
    const activeChannels = Object.values(isPlotting).filter(status => status).length;
    const imgWrapper = document.getElementById('img-wrapper');

    if (activeChannels === 0) {
        // If no channels are active, display the first wrapper and set appropriate width
        imgWrapper.style.display = 'flex';
        container.style.maxWidth = '715px'; // or any default width you prefer
    } else {
        imgWrapper.style.display = 'none';
        // Hide the first wrapper if any other channel is active
        switch (activeChannels) {
            case 1:
                container.style.maxWidth = '715px';
                break;
            case 2:
                container.style.maxWidth = '535px';
                break;
            case 3:
                container.style.maxWidth = '345px';
                break;
            default:
                container.style.maxWidth = ''; // Default style or specific width
        }
    }
}


document.addEventListener('DOMContentLoaded', () => {
    let selectedPort = null;
    updateContainerWidth();
    ipcRenderer.on('list-ports', (event, ports) => {
        const comPortsSelect = document.getElementById('comPorts');
        comPortsSelect.innerHTML = ''; // Clear existing options
    
        ports.forEach(port => {
            const option = document.createElement('option');
            option.value = port.path;
            option.textContent = port.path;
            comPortsSelect.appendChild(option);

            if (port.path === selectedPort) {
                option.selected = true;
            }
        });
    });
    document.getElementById('comPorts').addEventListener('change', (event) => {
        selectedPort = event.target.value;
    });

    for (let i = 1; i <= 3; i++) {
        const ctx = document.getElementById(`chart${i}`).getContext('2d');
        let tlabel;
        // if(i==1){
        //     tlabel = 'State of Charge (SOC)'
        // }else if(i==2){
        //     tlabel = 'Depth of Discharge (DOD)'
        // }else if(i==3){
        //     tlabel = 'Battery Voltage (V)'
        // } else if(i==4){
        //     tlabel = 'Battery Current (A)'
        // } else if(i==5){
        //     tlabel = 'Battery Power (Watt)'
        // } else {
        tlabel = 'Data' + String(i);
        // }
        charts.push(new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: tlabel,
                    data: [],
                    borderColor: '#007bff',
                    borderWidth: 2
                    
                }]
            },
            options: {
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: tlabel,
                        color: 'black',
                    }
                },
                scales: {
                    x: {
                        type: 'category',
                    },
                    y: {
                        type: 'linear',
                        beginAtZero: true,
                        ticks: {
                            color: "#000"
                        }
                    }
                },
                maintainAspectRatio: false,
                elements: {
                    point:{
                        radius: 0
                    },
                    line: {
                        tension: 0.4  
                    }
                }
            }
        }));
    }
    
    ipcRenderer.on('serial-data', (event, data) => {
        if (!isPortOpen) return;
        
        const values = data.split(',').map(Number);
        values.forEach((value, index) => {
            const channel = `channel${index + 1}`;
            if (isPlotting[channel]) {
                const chart = charts[index];
                if (chart.data.datasets[0].data.length >= 70) {
                    chart.data.labels.shift();
                    chart.data.datasets[0].data.shift();
                }
                chart.data.labels.push('');
                chart.data.datasets[0].data.push(value * currentMultipliers[channel]);
                updateChartScales(chart, chart.data.datasets[0].data);
                chart.update();
            } else {
                serialDataBuffer[channel].push(value);
            }
        });
    });
    

    function startPlotting(channel) {
        const chart = charts[channel.slice(-1) - 1];
        const dataBuffer = serialDataBuffer[channel];
        while(dataBuffer.length > 0) {
            const value = dataBuffer.shift(); // Remove and use the first value in the buffer
            if (chart.data.datasets[0].data.length >= 100) {
                chart.data.labels.shift();
                chart.data.datasets[0].data.shift();
            }
            chart.data.labels.push('');
            chart.data.datasets[0].data.push(value * currentMultipliers[channel]);
        }
        updateChartScales(chart, chart.data.datasets[0].data);
        chart.update();
    }
    


    for (let i = 1; i <= 3; i++) {
        for (let j = 1; j <= 10; j++) {
            document.getElementById(`channel${i}button${j}`).addEventListener('click', () => {
                const channel = `channel${i}`;
                const wrapper = document.getElementById(`wrapper${i}`);
                if (activeButton[channel] === j) {
                    // If the same button is clicked again, deactivate and reset
                    isPlotting[channel] = false;
                    resetAndUpdateChart(charts[i - 1], channel, 0);
                    activeButton[channel] = null;
                    updateButtonColors(channel, null);
                    wrapper.style.display = 'none';
                    updateContainerWidth();
                } else {
                    // Activate the new button and start plotting
                    currentMultipliers[channel] = multipliers[channel][j - 1];
                    isPlotting[channel] = true;
                    resetAndUpdateChart(charts[i - 1], channel, 0);
                    activeButton[channel] = j;
                    updateButtonColors(channel, j);
                    wrapper.style.display = 'block';
        
                    if (isPortOpen) {
                        startPlotting(channel);
                        updateContainerWidth();
                    }
                }
            });
        }
    }
    

    // for (let i = 1; i < 6; i++) {
    //     document.getElementById(`button${i}`).addEventListener('click', () => {
    //         dataToSend[i] = dataToSend[i] === 0 ? 1 : 0;
    //         updateButtonColor(i);
    //         // Call the sendData function once immediately to reflect the change
    //         const characterToSend = getCharacterToSend(i);
    //         ipcRenderer.send('send-to-arduino', characterToSend);
    //         console.log("Sent: ", characterToSend);
    //         sendData();
    //     });
    // }
    document.getElementById(`button0`).addEventListener('click', () => {
        const selectedPort = document.getElementById('comPorts').value;
        ipcRenderer.send('start-daq', selectedPort);
        isPortOpen = !isPortOpen;

        document.getElementById(`button0`).textContent = isPortOpen ? 'Stop DAQ' : 'Start DAQ';
    
        if (!isPortOpen) {
            // Reset all graphs and clear active button states
            for (let i = 1; i <= 3; i++) {
                const channel = `channel${i}`;
                resetAndUpdateChart(charts[i - 1], channel, 0);
                isPlotting[channel] = false;
                activeButton[channel] = null;
                updateButtonColors(channel, null);
            }
            updateContainerWidth();
        }
    });
    document.getElementById('downloadButton').addEventListener('click', downloadAllGraphsCSV);
});
