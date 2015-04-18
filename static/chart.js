var updater_id = undefined;

var scatter_chart;
var host_chart;

var memento_dt_moment, memento_dt_x;

var curr_ts_moment;
var curr_ts_sec;
var base_page_info;

var memento_dict;
var num_plot_mementos = 0;
var num_hosts = 0;

var last_url = undefined;
var last_timestamp = undefined;
var last_mem_length = 0;

function approx_eq(a, b)
{
    return Math.abs(a - b) < 0.0001;
}

var COLOR_MAP = 
    {"web.archive.org": "#1f77b4",

     "wayback.archive-it.org": "#17becf",

     "www.webarchive.org.uk": "#ff7f0e", 

     "webarchive.proni.gov.uk": "#ffbb78", 

     "swap.stanford.edu": "#2ca02c", 

     "www.webcitation.org": "#ff9896", 

     "wayback.vefsafn.is": "#d62728", 

     "veebiarhiiv.nlib.ee": "#98df8a", 

     "arquivo.pt": "#9467bd", 

     "nukrobi2.nuk.uni-lj.si": "#c5b0d5",

     "webarchive.loc.gov": "#8c564b",
     
     "webarchive.nationalarchives.gov.uk": "#e377c2",

     "MISSING": "#444",
    };

//"#8c564b", "#c49c94", "#e377c2", "#f7b6d2", "#7f7f7f", "#c7c7c7", "#bcbd22", "#dbdb8d", "#17becf", "#9edae5"]

function init_host_chart(memento_dict) {
    var names = {};
    var cols = [];
    var len = 0;

    var groups = [];

    for (host in memento_dict.urls) {
        if (typeof(memento_dict.urls[host]) === "number") {
            len = memento_dict.urls[host]
        } else {
            len = memento_dict.urls[host].length;
        }
        cols.push([host, len]);
        names[host] = host + " (" + len + ")";
        
        groups.push(host);
    }
    
    groups = Object.keys(COLOR_MAP);

    //  console.log(JSON.stringify(cols));
    //  console.log(JSON.stringify(names));

    var data = {
        columns: cols,
        names: names,

        colors: COLOR_MAP,

        type: 'bar',
        
        groups: [groups],
    };

    //host_chart = undefined;

    if (!host_chart) {
        host_chart = c3.generate({
            bindto: '#hostchart',

            data: data,

            axis: {
                rotated: false,
                x: {
                    show: false,
                    type: 'category',
                    categories: ['Archives'],
                },
                y: {show: false},
            },

            transition: {
                duration: 0
            },

            pie: {
                label: {
                    show: false,
                },
                expand: false
            },
            
            legend: {
                show: true,
                position: 'right',
            },
        });
    } else {
        //data.unload = true;
        host_chart.load(data);
    }

    //chart.resize({width: 400});
}


function init_scatter(mem_data)
{
    memento_dict = mem_data;

    var data = {
        json: memento_dict.plot,
        xs: memento_dict.xs,
        type: 'scatter',
        xSort: false,
        colors: COLOR_MAP,
        color: function (color, d) {
            if (typeof(d) === "object") {
                if (d.x == 0) {
                    color = d3.rgb(color).brighter(1).toString();
                }
            }
            return color;
        }
    };

//    if (scatter_chart) {
//        scatter_chart.unload();
//    }
    //  scatter_chart = undefined;

    // default: compute automatically
    var tick_count = undefined;
    var max_ticks = 6;

    if (num_plot_mementos < max_ticks) {
        tick_count = num_plot_mementos;
    }

    var padding = {left: 1.0, right: 1.0};

    if (num_plot_mementos == 1) {
        padding.left = padding.right = 0;
    }

    if (!scatter_chart) {
        
        var lines =  [{ value: 0, text: 'Requested' }];
        
        if (memento_dt_x) {
            lines.push({value: memento_dt_x, text: 'Base'});
        }
        
        scatter_chart = c3.generate({
            bindto: "#scatterchart",
            data: data,

            transition: {
                duration: 0,
            },

            point: {
                r: 5,
            },

            zoom: {
                enabled: true,
                extent: [1, 10000],
            },

            axis: {
                rotated: false,
                x: {
                    //type: 'timeseries',
                    show: true,
                    tick: {
                        //format: '%Y-%m-%d %H:%M:%S',
                        // format: function (date) { return moment(date).from(curr_ts_moment); },
                        format: function(x) { return x_to_date_offset(x); },
                        fit: false,
                        count: tick_count,
                        multiline: true,
                        width: 60,
                        culling: {
                            max: max_ticks,
                        },
                    },
                    padding: padding,
                },
                y: {
                    show: false,
                },
            },

            grid: {
                x: {
                    //show: true,
                    lines: lines,
                },
                front: true,
            },

            tooltip: {
                grouped: true,
                format: {
                    title: function (x) {
                        return x_to_date_offset(x, true);
                    },

                    value: function (value, ratio, id, index) {
                        if (memento_dict && memento_dict.urls && 
                            memento_dict.urls[id] && (index < memento_dict.urls[id].length)) {
                            value = memento_dict.urls[id][index];
                        }
                        return value;
                    }
                }
            },

            legend: {
                show: false,
            }

        });
    } else {
        //data.unload = true;
        scatter_chart.load(data);
    }
    //scatter_chart.flush();
    //scatter_chart.xgrids.add({value: 0});
    //scatter_chart.flush();
}

function format_ts(ts, sep)
{
    if (ts.length < 14) {
        ts += "20000101000000".slice(-14 + ts.length);
    }

    if (!sep) {
        sep = " ";
    }

    var datestr = (ts.substring(0, 4) + "-" +
                   ts.substring(4, 6) + "-" +
                   ts.substring(6, 8) + sep +
                   ts.substring(8, 10) + ":" +
                   ts.substring(10, 12) + ":" +
                   ts.substring(12, 14));

    return datestr;
}

function ts_to_date(ts)
{
    var datestr = format_ts(ts, "T") + "-00:00";
    return new Date(datestr);
}

function init_moment_js()
{
    var rel = moment.localeData()._relativeTime;
    rel.future = "%s after";
    rel.past = "%s before";
    moment.locale('en', rel);
}

function format_diff(curr, base)
{
    // human readable difference, including seconds instead of a 'a few seconds'

    var diff = curr.diff(base);
    //var str = moment.duration(diff).humanize(true);

    var str = curr.from(base);

    if (str.indexOf("a few seconds") < 0) {
        return str;
    }

    var value;

    diff = Math.abs(Math.round(diff / 1000));

    if (diff == 1) {
        value = "one second";
    } else {
        value = diff + " seconds";
    }

    str = str.replace("a few seconds", value);
    return str;
}

//function update_capture_info(secs, request_ts)
//{
//    if (!secs) {
//        return;
//    }
//    
//    var status_str;
//
//    if (!curr_request_moment.isValid() || curr_request_moment.isSame(curr_ts_moment)) {
//        status_str = "";
//    } else {
//        status_str = format_diff(curr_ts_moment, curr_request_moment);
//
//        status_str = status_str;
//        status_str += " " + format_ts(request_ts);
//        //status_str += request_moment.format("YYYY-MMM-DD HH:mm:ss") + "</b>";
//    }
//
//    var elem = document.getElementById("ts_info");
//
//    if (elem) {
//        elem.innerHTML = curr_moment.format("YYYY-MM-DD HH:mm:ss");
//    }
//
//    elem = document.getElementById("requested_info");
//    
//    if (!elem) {
//        return;
//    }
//
//    if (!request_ts) {
//        return;
//    }
//
//    elem.innerHTML = status_str;
//
//}

function update_banner(info, include_frames)
{
    var url = info.url;
    var timestamp = info.timestamp;

    if (!url || !timestamp) {
        return;
    }

    if (last_url != url || last_timestamp != timestamp) {
        if (!info.seconds) {
            info.seconds = ts_to_date(info.timestamp).getTime() / 1000;
        }
        
        info.request_secs = ts_to_date(info.request_ts).getTime() / 1000;
        
        curr_ts_sec = info.request_secs;
        curr_ts_moment = moment(curr_ts_sec * 1000);
        
        memento_dt_x = log_scale(info.seconds - info.request_secs);
        console.log(memento_dt_x);
        
        memento_dt_moment = moment.utc(info.seconds * 1000);

        base_page_info = memento_dt_moment.utc().format("YYYY-MM-DD HH:mm:ss");
        
        //memento_dt_info = curr_request_moment.utc().format("YYYY-MM-DD HH:mm:ss");
        //update_capture_info(info.seconds, info.request_ts);

        last_url = url;
        last_timestamp = timestamp;
        last_mem_length = 0;
    }

    load_all(info, include_frames);
}

function load_all(info, include_frames)
{
    var replay_frame = document.getElementById("replay_iframe").contentWindow;

    // make list of all frame urls
    var frame_url_list = [];

    if (include_frames) {
        walk_frames(replay_frame, frame_url_list);
    } else {
        frame_url_list.push(replay_frame.location.href);
    }

    //console.log(JSON.stringify(frame_list));

    var counter = 0;

    var all_mems = undefined;

    var curr_frame_url = replay_frame.location.href;

    for (var i = 0; i < frame_url_list.length; i++) {
        var url = frame_url_list[i].replace("/replay/", "/api/");
        d3.json(url, function(error, json) {
            counter++;

            if (!all_mems) {
                all_mems = json;
            } else {
                for (key in json) {
                    all_mems[key] = json[key];
                }
            }

            // Only update after all frames have been checked..
            if (counter >= frame_url_list.length) {
                // ensure still on same page
                if (replay_frame.location.href == curr_frame_url) {
                    update_charts(info, all_mems);
                }
            } 
        });
    }
}

function walk_frames(frame, frame_url_list)
{
    if (!frame.WB_wombat_location) {
        return;
    }
    
    // This check will throw if cross-origin frame, so just skip it
    try {
        if (frame.location.href === "about:blank") {
            return;
        }

        frame_url_list.push(frame.location.href);
    } catch (e) {
        return;
    }
        
    for (var i = 0; i < frame.frames.length; i++) {
        walk_frames(frame.frames[i], frame_url_list);
    }
}

function log_scale(diff)
{
    var scaler = 1;
    if (diff < 0) {
        diff = -diff;
        scaler = -1;
    }
    var result = Math.log(diff + 1) / Math.log(10);
    return scaler * result;
}

function x_to_date_offset(x, add_abs)
{
    if (x == 0) {
        return base_page_info;
    }

    var scaler = 1;
    if (x < 0) {
        x = -x;
        scaler = -1;
    }

    var sec = Math.pow(10, x) - 1;
    sec = curr_ts_sec + (scaler * sec);

    var the_moment = moment(sec * 1000);
    
    var diff = format_diff(the_moment, curr_ts_moment);
    
    if (add_abs) {
        diff += " at " + the_moment.utc().format("YYYY-MM-DD HH:mm:ss");
    }
    
    return diff;
}

function update_charts(info, json) {
    var mem_length = Object.keys(json).length;

    if (mem_length == last_mem_length) {
        return;
    }

    last_mem_length = mem_length;

    var mem_plot = {};
    var mem_xs = {};
    var mem_urls = {};

    num_plot_mementos = 0;
    num_hosts = 0;

    var curr_min_sec = curr_ts_sec;
    var curr_max_sec = curr_ts_sec;

    var hasPoints = false;

    for (var key in json) {
        if (key.length > 0 && key[0] == "_") {
            continue;
        }

        var list = key.split(" ");

        var sec = parseInt(json[key]);
        //var curr_moment = moment.unix(sec);

        var host = list[0];
        host = host.split(":")[0];
        var ts = list[1];
        var mem_url = list[2];

        if (!mem_urls[host]) {
            if (host != "MISSING") {
                mem_plot[host] = [];
                mem_plot[host + "_x"] = [];
                mem_xs[host] = host + "_x";
                num_hosts++;
            }
            mem_urls[host] = [];
            hasPoints = true;
        }

        mem_urls[host].push(mem_url);

        if (host == "MISSING") {
            continue;
        }

        curr_max_sec = Math.max(sec, curr_max_sec);
        curr_min_sec = Math.min(sec, curr_min_sec);

        //var cdate = new Date(sec * 1000);
        var x = log_scale(sec - curr_ts_sec);

        function make_hash(str) {
            var hash = 0;
            for (i = 0; i < str.length; i++) {
                var char = str.charCodeAt(i);
                hash = ((hash<<5)-hash)+char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return hash;
        }
        //var y = Math.random() * 4.0 - 2.0;
        var y = make_hash(mem_url) % 40 - 20;

        if ((curr_ts_sec == sec) && (mem_url == last_url)) {
            y = 0.5;
            x = 0;
        }

        mem_plot[host + "_x"].push(x);
        mem_plot[host].push(y);
        num_plot_mementos++;
    }

    var mem_data = {
        plot: mem_plot,
        xs: mem_xs,
        urls: mem_urls
    };

    if (hasPoints) {
        init_scatter(mem_data);
        init_host_chart(mem_data);
    }

    var status;
    var meminfo_elem = document.getElementById("scatterinfo");

    if (num_plot_mementos <= 1) {
        status = "Single Page Memento";
    } else {
        var timespan = format_diff(moment(curr_max_sec * 1000),
                                   moment(curr_min_sec * 1000));

        timespan = timespan.substring(0, timespan.lastIndexOf("after"));

        status = "The page below assembled using <b>{num}</b> Mementos from <b>{hosts}</b> archives, spanning <b>{sec}</b>";
        status = status.replace("{num}", num_plot_mementos);
        status = status.replace("{sec}", timespan);
        status = status.replace("{hosts}", num_hosts);
    }

    if (meminfo_elem) {
        meminfo_elem.innerHTML = status;
    }
}

function stop_anim()
{
    var elem = document.getElementById("icon");
    if (elem) {
        elem.classList.remove("rotate");
    }
}

function start_anim()
{
    var elem = document.getElementById("icon");
    if (elem) {
        elem.classList.add("rotate");
    }

    if (updater_id) {
        return;
    }

    updater_id = window.setInterval(update_while_loading, 2000);
}

function update_while_loading()
{
    if (document.readyState === 'complete') {
        window.clearInterval(updater_id);
        updater_id = undefined;
        stop_anim();
        // don't call do_update, that's called by eventlistener
    } else {
        do_update(document.getElementById("replay_iframe").contentWindow, false);
    }
}

function do_update(replay_frame, include_frames)
{
    var info;

    if (replay_frame && replay_frame.wbinfo) {
        info = replay_frame.wbinfo;
    } else {
        info = {}
        info.url = curr_state.url;
        info.timestamp = curr_state.timestamp;
        info.request_ts = curr_state.request_ts;
    }

    update_banner(info, include_frames);
}

function toggle_banner()
{
    var banner = document.getElementById('mt_banner');
    banner.classList.toggle('closed');

    var frame_div = document.getElementById('iframe_div');
    frame_div.classList.toggle('closed');

    var toggle = document.getElementById('banner_toggle');

    if (banner.classList.contains('closed')) {
        toggle.innerHTML = "Time Travel!";
    } else {
        toggle.innerHTML = "&#10006;";
    }
}

function iframe_unloaded()
{
    start_anim();
}
