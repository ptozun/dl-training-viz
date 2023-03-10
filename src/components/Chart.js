import React from 'react';
import { useState, useEffect, useRef } from 'react';
import Highcharts from 'highcharts/highstock';
import HighchartsReact from 'highcharts-react-official';
import '../styles/Chart.css';

class Chart extends React.Component {

    constructor(props) {
		super(props);
		this.state = {
            options: {
                title: {
                    style: {
                        fontWeight: 'bold'
                    }
                },
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
                    },
                    fallbackToExportServer: false
                },
                chart: {
                    type: "line",
                    zoomType: 'x',
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
                        text: "Time Elapsed",
                        style: {
                            fontWeight: 'bold'
                        }
                    },
                    labels:{
                        formatter:function(){
                            return (milliToMinsSecs(this.value))            
                        },
                    },
                },
                yAxis: {
                    opposite: false,
                    title: {
                        text: "Value",
                        style: {
                            fontWeight: 'bold'
                        }
                    },
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
                    split: false
                },
                navigator: {
                    xAxis: {
                        labels: {
                            enabled: false
                        }
                    },
                    height: 75,
                    enabled: true,
                    boostThreshold: 0,
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
                        boostThreshold: 0,
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
                        events: {
                            legendItemClick: this.toggleSeriesVisibility.bind(this)
                        }
                    },
                },
            },
            loading: true,
            id: null,
            data: [],
            workloads: [],
            shownRuns: [],
            hiddenSeries: [],
            smoothing: 0
		}; 

        this.chartRef = React.createRef();
        this.handleShowRunsSwitch = (workloadId) => (event) => this.toggleShownRuns(workloadId, event);
	}

    componentDidMount() {
        // get initial list of all normal workload ID's for rendering
        const workloads = [];
        this.props.chartData.data.forEach(run => {
            if (run.workload.substring(run.workload.indexOf("-") + 1) !== "null") {
                if (workloads.indexOf(run.workload) === -1) {
                    workloads.push(run.workload);
                }       
            }
        })
        this.setState({workloads: workloads});

        // generate series
        if (this.props.chartData.context) {
            // with local uploaded settings 
            this.generateSeries(this.props.chartData, this.props.chartData.context.smoothing, this.props.chartData.context.shownRuns, this.props.chartData.context.hiddenSeries); 
        }   
        else {
            // with default settings (e.g. no smoothing and combined as workloads)
            this.generateSeries(this.props.chartData, 0, [], []); 
        }
    }

    // sync contextual chart information to ChartPicker parent for local downloading
    componentDidUpdate(prevProps, prevState) {
        if (prevState.smoothing !== this.state.smoothing || prevState.shownRuns.length !== this.state.shownRuns.length || prevState.hiddenSeries.length !== this.state.hiddenSeries.length) {     
            this.props.pullChartExtras(this.state.id, this.state.smoothing, this.state.shownRuns, this.state.hiddenSeries);
        }
    }

    generateSeries(newChartData, newSmoothing, newShownRuns, newHiddenSeries) {


        //console.log(this.chartRef.current.chart.series);
        this.chartRef.current.chart.series.forEach(series => {
            if (series.navigatorSeries) {
                //series.remove();
                //console.log("SERIES REMOVED!");
            }
        })


        //console.log("Generating..."); // debugging

        const data = newChartData.data;

        // format data into series for highcharts
        const allSeries = [];
        data.forEach(run => {
            if (run.data !== undefined) {      
                let workloadId = run.workload;

                // check for ungrouped workloads or unsorted workloads
                if (workloadId.substring(workloadId.indexOf("-") + 1) === "null" || newShownRuns.indexOf(workloadId) > -1) {
                    if (run.letter === null) {
                        const removeNull = workloadId.substring(0, workloadId.indexOf("-"));
                        workloadId = removeNull + " (" + run.name.substring(0, 5) + ")";
                    }
                    else {
                        if (run.letter.length > 1) {
                            workloadId = workloadId + " " + run.letter;
                        }
                        else {
                            workloadId = workloadId + " " + run.letter + " (" + run.name.substring(0, 5) + ")";
                        }             
                    }   
                } 


                // add all runs to one series per workload, unless they are unsorted runs
                const seriesIndex = allSeries.findIndex(series => series.id === workloadId);
                if (seriesIndex === -1) {      

                    let newSeries = {
                        id: workloadId,
                        data: [],
                        custom: {
                            ids: new Set() 
                        }
                    };
                    

                    newSeries.custom.ids.add(run.name);



                    run.data.forEach(data => {
                        newSeries.data.push([data.timestamp, data.value]);
                    })
                    allSeries.push(newSeries);
                }
                else {
                    run.data.forEach(data => {
                        allSeries[seriesIndex].data.push([data.timestamp, data.value]);
                    })

                    
                    allSeries[seriesIndex].custom.ids.add(run.name); 

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

            // hide any series which are supposed to be invisible
            series.visible = true;

            newHiddenSeries.forEach(seriesToHide => {
                if (series.name === seriesToHide) {
                    series.visible = false;
                }
            })
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
            options: {
                title: {
                    text: newChartData.metric
                },
                series: allSeries,
                navigator: {
                    series: allSeries
                },
                tooltip: {
                    formatter: function() {
                        return '<b>Series:</b>' + this.series.name +'<br/><br/><b>ID(s):</b><br />' + [...this.series.userOptions.custom.ids].join('<br />');
                        //return  '<b>Series:</b>' + this.series.name +'<br/><br/><b>Value:</b> ' + this.y + '<br/><b>Time Elapsed:</b> ' + milliToMinsSecs(this.x);
                    }
                },
            },   
            shownRuns: newShownRuns,
            hiddenSeries: newHiddenSeries,
            smoothing: newSmoothing,
            loading: false
        });
              
    }

    applySmoothness(smoothing) { 
        if (smoothing !== this.state.smoothing) {
            this.generateSeries(this.props.chartData, smoothing, this.state.shownRuns, this.state.hiddenSeries);
        }
    }

    toggleShownRuns(workloadId, event) {
        const toAdd = event.target.checked;
        const shownRuns = [...this.state.shownRuns];
        const workloadIdIndex = shownRuns.indexOf(workloadId);
        if (toAdd) {
            if (workloadIdIndex === -1) {
                shownRuns.push(workloadId);
            }        
        }
        else{
            if (workloadIdIndex > -1) {
                shownRuns.splice(workloadIdIndex, 1);
            }
        }
        this.generateSeries(this.props.chartData, this.state.smoothing, shownRuns, this.state.hiddenSeries);
    }

    toggleSeriesVisibility(event) {
        // prevent default highcharts behaviour
        event.preventDefault();

        // add/remove series name from an array
        const newHiddenSeries = [...this.state.hiddenSeries];
        if (event.target.visible === true) {
            // will be set to invisible
            const seriesName = event.target.legendItem.textStr;

            if (newHiddenSeries.indexOf(seriesName) === -1) {
                newHiddenSeries.push(seriesName);
            }  
        }
        else {
            // will be set to visible
            const seriesName = event.target.legendItem.textStr;
            if (newHiddenSeries.indexOf(seriesName) > -1) {
                newHiddenSeries.splice(newHiddenSeries.indexOf(seriesName), 1);
            } 
        }

        // update chart and state
        this.generateSeries(this.props.chartData, this.state.smoothing, this.state.shownRuns, newHiddenSeries); 
    }

    componentDidUpdate() {

        this.chartRef.current.chart.series.forEach(series => {
            //console.log(series);
            //series.userOptions.custom.models.add("WILLIES");
            series.userOptions.custom.ids.forEach(model => {
                //console.log(model);
            })
            //console.log("------------------------")

        })
    }

    render() {
        const { data, options, id, workloads, smoothing } = this.state;
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
                    callback={this.afterChartCreated}
                />          
                <Slider 
                    onSetSmoothness={this.applySmoothness.bind(this)}
                    defaultValue={smoothing}
                />
                <div id="workloadGroupingControlsWrapper">
                    Toggle Runs:
                    {workloads.map(workload => (
                        <div key={workload}>
                            {workload}
                            <label className="switch">
                                <input 
                                    type="checkbox" 
                                    onChange={this.handleShowRunsSwitch(workload)} 
                                />
                                <span className="slider round"></span>
                            </label>
                        </div>        
                    ))}
                </div>
                <div id="chartMetadataWrapper">
                    {data.map(series => (
                        <div className="seriesMetadata" key={series.name}>
                            <span className="label" style={{color: "black"}}>Experiment: </span><span className="metadata">{series.experimentName}</span><br />
                            <span className="label">Workload: </span>{series.workload}<br />
                            <span className="label">Letter: </span>{series.letter}<br />
                            <span className="label">ID: </span>{series.name.substring(0, 6)}<br />
                            <span className="label">Duration: </span>{milliToMinsSecs(series.duration)}<br />
                            <span className="label">Model: </span>{series.model}<br />
                            <span className="label">Source: </span>{series.source}<br />
                            <span className="label">Params: </span>{series.params}<br />
                        </div>        
                    ))}
                </div>
            </div>
        );
    }
}

/* Chart functional components */
function Slider(props) {
    const [smoothness, setSmoothness] = useState(0);
    const slider = useRef();

    useEffect(() => {
        setSmoothness(props.defaultValue);
    }, [props.defaultValue]);

    useEffect(() => {
        slider.current.addEventListener('change', e => props.onSetSmoothness(e.target.value));
    }, [props]);
    const handleShowSmoothness = e => {
        setSmoothness(e.target.value);
    };
    return (
        <div id="smootherWrapper">
            <label htmlFor="smoother">Smoothness: </label>
            <input ref={slider} onChange={handleShowSmoothness} value={smoothness} type="range" name="smoother" min="0" max="99" /> 
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