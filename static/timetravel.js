/**
 * This file is part of the extension Memento for Chrome.
 * http://mementoweb.org
 * Copyright 2015,
 * Harihar Shankar, Herbert Van de Sompel, Lyudmila Balakireva
 * -- Los Alamos National Laboratory. 
 * Licensed under the BSD open source software license.
 * You may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://mementoweb.github.io/SiteStory/license.html
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

function init_iframe_height() {

    var frame = document.getElementById("replay_iframe");
    //var iframe_div = document.getElementById("iframe_div");
    var frameHeight = frame.contentWindow.document.body.offsetHeight;
    var body = document.body,
            html = document.documentElement;

    var bodyHeight = Math.max( body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight );
//    bodyHeight = bodyHeight - 360;
    if (frameHeight > bodyHeight) {
        frame.style.height = (360 + frameHeight) + 'px';
    }
    else {
        frame.style.height = bodyHeight + "px";
    }
    frame.style.height = bodyHeight + "px";
}

function update_memento_ui(curr_state) {
    var mementoDatetime;
    var acceptDatetime;
    var requestUrl;
    
    if (curr_state && curr_state.url) {
        // Curr state is updated by wb_frame.js library
        acceptDatetime = curr_state.request_ts;
        mementoDatetime = curr_state.timestamp;
        requestUrl = curr_state.url;
    } else {
        // intiially set mementoDatetime to acceptDatetime
        acceptDatetime = wbinfo.timestamp;
        mementoDatetime = acceptDatetime;
        requestUrl = wbinfo.capture_url;
    }
    
    init_iframe_height();

    $("#list_menu_top").load("/menu_top.html");
    $("#list_footer").load("/menu_bottom.html", function() {
        //$("#menu_bottom").center();
    });
    $( window ).resize( function() {
        //$("#menu_bottom").center();
        $("#result_wrapper").css("min-height", calculateMinHeightForResults()+16 + "px");
    });
    var adt = null;
    if (acceptDatetime) {
        adt = convertToDate(acceptDatetime);
    }
    if (!adt || isNaN(adt.valueOf())) {
        adt = new Date();
    }
    $("#datepicker").val(getDisplayDate(adt));
    $("#timepicker").val(getDisplayTime(adt));

    $("#url").val(requestUrl);

    $("#search").button()
    .click( function() {
        var date = $("#datepicker").val();
        date += "T" + $("#timepicker").val() + "Z";
        var d = convertToDate(date);
        reloadPage(getMachineDate(d), "list");
    });

    $("#reconstruct").button()
    .click( function() {
        var date = $("#datepicker").val();
        date += "T" + $("#timepicker").val() + "Z";
        var d = convertToDate(date);
        reloadPage(getMachineDate(d), "reconstruct");
    });
    $("#summary").center();
    
    $("#prev_memento").button({
        label: "&#9668"
    });
    $("#next_memento").button({
        label: "&#9658"
    });
    
    if (mementoDatetime) {
        var memDate = convertToDate(mementoDatetime);
        $("#this_memento").text( getDisplayDate(memDate) + " " + getDisplayTime(memDate) + " GMT");
    }
    
    function set_nav_link(prefix, id, ts)
    {
        var elem = $(id);
        
        // disable if no timestamp
        elem.button("option", "disabled", !ts);
        
        if (!ts) {
            return;
        }

        elem.attr("href", wbinfo.prefix + ts + "/" + curr_state.url);

        var dt = convertToDate(ts);
        var title = prefix + getDisplayDate(dt) + " " + getDisplayTime(dt) + " GMT";
        elem.attr("title", title);
    }
    
    if (curr_state) {
        set_nav_link("Previous: ", "#prev_memento", curr_state.prev);
        set_nav_link("Next: ", "#next_memento", curr_state.next);
    }

    
//    if ($("#prev_memento").attr("title") == "Previous: ") {
//        $("#prev_memento").button("option", "disabled", true);
//    }
//    if ($("#next_memento").attr("title") == "Next: ") {
//        $("#next_memento").button("option", "disabled", true);
//    }
    
    //enableSearchOnEnterKey();
    $("#result_wrapper").css("min-height", calculateMinHeightForResults() + "px");

    /*
    $(".more_mementos_icon").addClass("ui-icon ui-icon-minus");
    $(".more_mementos").next().hide();
    $(".more_mementos_icon").switchClass("ui-icon-minus", "ui-icon-plus");
    $(".more_mementos").first().next().show();
    $($(".more_mementos").first().children()[0]).switchClass("ui-icon-plus", "ui-icon-minus");
    $(".more_mementos").click( function() {
        var sub_results = $(this).next();
        var isOpen = sub_results.is(":visible");
        sub_results[isOpen ? 'slideUp' : 'slideDown']()
        .trigger(isOpen ? 'hide' : 'show');

        if (isOpen) {
            $($(this).children()[0]).switchClass("ui-icon-minus", "ui-icon-plus");
        }
        else {
            $($(this).children()[0]).switchClass("ui-icon-plus", "ui-icon-minus");
        }

    });
    */

};

var loadingAnimation = 0;

function loadAnimation() {
    var i = 0;
    return setInterval(function() {
        i = ++i %7;
        $("#scatterinfo").html(Array(i+1).join("-") + " Reconstructing the page " + Array(i+1).join("-"));
    }, 800);
}

$(function() {
    loadingAnimation = loadAnimation();
    update_memento_ui();
});

// api from wb.js
//if (window._wb_js) {
//    _wb_js.create_banner_element = function(banner_id)
//    {
//        if (updater_id) {
//            return;
//        }
//
//        if (document.readyState !== 'complete') {
//            updater_id = window.setInterval(update_while_loading, 2000);
//        }
//    }
//}

// api from wb_frame.js
// TODO: make this into an event
window.set_state = function(state) {
    curr_state = state;
    
    var replay_frame = document.getElementById("replay_iframe").contentWindow;
    
    if (replay_frame.wbinfo) {
        curr_state.prev = replay_frame.wbinfo.m_prev || replay_frame.wbinfo.m_first;
        curr_state.next = replay_frame.wbinfo.m_next || replay_frame.wbinfo.m_last;
        curr_state.first = replay_frame.wbinfo.m_first;
        curr_state.last = replay_frame.wbinfo.m_last;
    }
    
    update_memento_ui(curr_state);
    
    do_update(replay_frame, true);

    if (replay_frame.document && 
        replay_frame.document.readyState === 'complete') {
        stop_anim();
    }
}
