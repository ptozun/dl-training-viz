import React from 'react';
import { useState, useEffect, useRef } from 'react';
import Highcharts from 'highcharts/highstock';
import HighchartsReact from 'highcharts-react-official';
import '../styles/Chart.css';

class Chart extends React.Component {

    constructor(props) {
		super(props);
		this.state = {
            loading: true,
            id: null,
            data: [],
            workloads: [],

            showRuns: [],
            smoothing: 0,

            options: {
                exporting: {
                    buttons: {
                        contextButton: {
                            align: 'left',
                            x: 0,
                            y: -5,
                            verticalAlign: 'top'
                        }
                    },
                    scale: 3,
                    sourceWidth: 1200,
                    sourceHeight: 800,
                    chartOptions: {
                        navigator: {
                            enabled: false       
                        },
                    }
                },
                chart: {
                    type: "line",
                    zoomType: 'x'
                },
                legend: {
                    enabled: true
                },
                xAxis: {
                    events: {
                        setExtremes: function(event){
                            if (!this.zoomButton) {
                                const chart = this.chart;
                                this.zoomButton = chart.renderer.button('Reset Zoom', null, null, function() {
                                    chart.xAxis[0].setExtremes(null, null);
                                }, {
                                    zIndex: 20
                                }).attr({
                                    id: 'resetZoom',
                                    align: 'left'
                                }).add().align({
                                    align: 'left',
                                    x: 50,
                                    y: 0
                                }, false, null);                    
                            }
                            if(!event.min && !event.max){
                                if (this.zoomButton != null) {
                                    this.zoomButton.destroy();
                                    this.zoomButton = null;
                                }                      
                            }
                        }
                    },
                    ordinal: false,
                    type: "datetime",
                    title: {
                        text: "Time"
                    },
                    labels:{
                        formatter:function(){
                            return (milliToMinsSecs(this.value))            
                        },
                     },
                },
                yAxis: {
                    opposite: false
                },
                credits: {
                    enabled: false
                },
                accessibility: {
                    enabled: false
                },
                tooltip: {
                    crosshairs: {
                        color: 'black',
                        dashStyle: '5'
                    },
                    shared: false,
                    split: false,
                    formatter: function() {
                        return  '<b>Series:</b>' + this.series.name +'<br/><br/><b>Value:</b> ' + this.y + '<br/><b>Time:</b> ' + milliToMinsSecs(this.x);
                    }
                },
                navigator: {
                    xAxis: {
                        labels: {
                            enabled: false
                        }
                    },
                    height: 75,
                    enabled: true,
                    boostThreshold: 1,
                    series: {
                        dataGrouping: {
                            enabled: false
                        }
                    }        
                },
                rangeSelector: {
                    enabled: false
                },
                scrollbar: {
                    enabled: false
                },
                plotOptions: {
                    series: {
                        boostThreshold: 1,
                        marker: {
                            radius: 1
                        },       
                        states: {
                            hover: {
                                enabled: false,
                                halo: {
                                    size: 0
                                }
                            },
                            inactive: {
                                opacity: 1
                            }
                        },
                        dataGrouping: {
                            enabled: false,
                            units: [[
                                'millisecond', 
                                [1] 
                            ]]
                        },
                    },
                },
            },
		}; 

        this.chartRef = React.createRef();
        this.handleWorkloadGroupingCheckbox = (workloadId) => (event) => this.toggleWorkloadGrouping(workloadId, event);
	}

    componentDidMount() {
        // get initial list of all normal workload ID's
        const workloads = [];
        this.props.chartData.data.forEach(run => {
            if (run.workload.substring(run.workload.indexOf("-") + 1) != "null") {
                if (workloads.indexOf(run.workload) === -1) {
                    workloads.push(run.workload);
                }       
            }
        })
        this.setState({workloads: workloads})

        // generate series with default settings (e.g. no smoothing and combined as workloads)
        this.generateSeries(this.props.chartData, [], 0);      
    }

    componentDidUpdate(prevProps, prevState) {

        console.log(this.chartRef.current.chart);

        //this.chartRef.current.chart.series[5].hide();

        this.chartRef.current.chart.series.forEach(series => {
            console.log(series.visible);
        });

    }

    generateSeries(newChartData, newUngroupedWorkloadIds, newSmoothing) {

        const data = newChartData.data;

        // format data into series for highcharts
        const allSeries = [];
        data.forEach(run => {
            if (run.data !== undefined) {      
                let workloadId = run.workload;

                // check for unsorted runs
                if (workloadId.substring(workloadId.indexOf("-") + 1) === "null") {
                    workloadId = workloadId + "-" + run.name.substring(0, 5);
                }

                // check for ungrouped workloads
                if (newUngroupedWorkloadIds.indexOf(workloadId) > -1) {
                    workloadId = workloadId + "-" + run.name.substring(0, 5);
                } 

                // add all runs to one series per workload, unless they are unsorted runs
                const seriesIndex = allSeries.findIndex(series => series.id === workloadId);
                if (seriesIndex === -1) {                  
                    let newSeries = {
                        id: workloadId,
                        data: []
                    };
                    run.data.forEach(data => {
                        newSeries.data.push([data.timestamp, data.value]);
                    })
                    allSeries.push(newSeries);
                }
                else {
                    run.data.forEach(data => {
                        allSeries[seriesIndex].data.push([data.timestamp, data.value]);
                    })
                }
            }
        });

        // sort all series by unix timestamp
        allSeries.forEach(series => {
            series.data.sort((a, b) => a[0] - b[0]);
        });

        // subtract earliest time from all timestamps to get ms passed
        allSeries.forEach(series => {
            const earliestTime = series.data[0][0];
            series.data.forEach(timeAndValue => {
                timeAndValue[0] = timeAndValue[0] - earliestTime;
            });

            // add name
            series.name = series.id;

            // prevent duplicate ids in highcharts api
            delete series.id;

            // make sure all series are toggled visible (except when smoothing)
            if (newSmoothing === this.state.smoothing) {
                series.visible = true;
            }
        });

        // apply smoothing to each series if over zero
        if (newSmoothing > 0) {
            allSeries.forEach(series => {
                series.data = calcEMA(series.data, newSmoothing);
            });
        }
        
        // update state which will update render of chart
        this.setState({
            id: newChartData.id,
            data: newChartData.data,
            unGroupedWorkloadIds: newUngroupedWorkloadIds,
            smoothing: newSmoothing,
            options: {
                title: {
                    text: newChartData.metric
                },
                series: allSeries,
                navigator: {
                    series: allSeries
                }
            },
            loading: false
        });
    }

    applySmoothness(smoothing) { 
        this.generateSeries(this.props.chartData, this.state.showRuns, smoothing);
    }

    toggleWorkloadGrouping(workloadId, event) {
        const toAdd = event.target.checked;
        const unGroupedWorkloadIds = this.state.showRuns;
        const workloadIdIndex = unGroupedWorkloadIds.indexOf(workloadId);
        if (toAdd) {
            if (workloadIdIndex === -1) {
                unGroupedWorkloadIds.push(workloadId);
            }        
        }
        else{
            if (workloadIdIndex > -1) {
                unGroupedWorkloadIds.splice(workloadIdIndex, 1);
            }
        }
        this.generateSeries(this.props.chartData, unGroupedWorkloadIds, this.state.smoothing);
    }

    render() {
        const { options, id, workloads } = this.state;
        return (
            <div className="chartWrapper">
                <button 
                    className="removeChartBtn"
                    onClick={() => this.props.removeChart(id)}
                >
                    X
                </button>
                <HighchartsReact 
                    highcharts={Highcharts} 
                    constructorType="stockChart"
                    containerProps={{className: "chart"}}
                    options={options}         
                    ref={ this.chartRef }
                />          
                <Slider 
                    onSetSmoothness={this.applySmoothness.bind(this)}
                />
                <div id="workloadGroupingControlsWrapper">
                    Toggle Runs:
                    {workloads.map(workload => (

                        <div key={workload}>
                            {workload}
                            <label className="switch">
                                <input 
                                    type="checkbox" 
                                    onChange={this.handleWorkloadGroupingCheckbox(workload)} 
                                />
                                <span className="slider round"></span>
                            </label>
                        </div>                    
                    ))}
                </div>         
            </div>
        );
    }
}

/* Chart functional components */
function Slider(props) {
    const [smoothness, showSmoothness,] = useState(0);
    const slider = useRef();

    useEffect(() => {
        slider.current.addEventListener('change', e => props.onSetSmoothness(e.target.value));
    }, []);
    
    const handleShowSmoothness = e => {
        showSmoothness(e.target.value);
    };

    return (
        <div id="smootherWrapper">
            <label htmlFor="smoother">Smoothness: </label>
            <input ref={slider} onChange={handleShowSmoothness} defaultValue="0" type="range" name="smoother" min="0" max="99" /> 
            {smoothness}%
        </div>
    );
}

/* Chart helper functions */
function milliToMinsSecs(ms) {
    let label;
    let numOfDays = Math.trunc(ms / 86400000);
    if (numOfDays > 0) {
        label = numOfDays + "d " + new Date(ms).toISOString().slice(11, 19);
    }
    else {
        label = new Date(ms).toISOString().slice(11, 19);
    }
    return label;
}
function calcEMA(series, smoothingWeight) {

    // calculate smoothness using the smoothingWeight divided by the max smoothness
    const smoothness = smoothingWeight / 100;

    // separate data from timestamps
    let time = series.map(a => a[0]); 
    let data = series.map(a => a[1]);  

    // first item is just first data item
    let emaData = [data[0]]; 

    // apply smoothing according to range and add to new EMA array
    const k = 2 / (smoothness + 1);    
    for (var i = 1; i < series.length; i++) {
        const emaResult = data[i] * (1 - smoothness) + emaData[i - 1] * (smoothness);
        emaData.push(emaResult.toFixed(4) * 1);
    }

    // recombine the new EMA array with the timestamp array
    let emaSeries = [];
    for (let i = 0; i < emaData.length; i++) {           
        emaSeries.push([time[i], emaData[i]]);
    }

    // return final series for highcharts API
    return emaSeries;
}

export default Chart;