// ==UserScript==
// @name         Keylol-Autorate
// @namespace    Keylol
// @include      https://keylol.com/*
// @require      https://code.jquery.com/jquery-3.5.1.min.js#sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0=
// @version      1.0.2
// @icon         https://raw.githubusercontent.com/ohperhaps/Keylol-Autorate/master/img/konoha.png
// @downloadURL	 https://github.com/ohperhaps/Keylol-Autorate/raw/master/keylol-autorate.user.js
// @updateURL	 https://github.com/ohperhaps/Keylol-Autorate/raw/master/keylol-autorate.user.js
// @description  Keylol forum autorate tool
// @author       ohperhaps
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==
(function() {
    'use strict';
    const $ = unsafeWindow.jQuery;
    const homePage = "https://keylol.com/";
    const selfUid = $("li.dropdown").find("a").attr("href").split("-")[1]
    const formHash = $("[name=formhash]").val();
    function xhrAsync (url, method="GET", data="") {
        if (method == "GET") {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    "method": "GET",
                    "url": homePage + url,
                    "onload": resolve
                })
            })
        } else if (method == "POST") {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    "method": "POST",
                    "url": homePage + url,
                    "data": data,
                    "onload": resolve
                })
            })
        }
    }
    function compare(property){
        return function(a,b){
            let value1 = a[property];
            let value2 = b[property];
            return value1 - value2;
        }
    }
    async function getUserScore() {
        let threads = await xhrAsync(`forum.php?mod=guide&view=newthread`).then((res) => {
            let threads = new Array()
            $("div.bm_c", res.response).find("tbody").each(function () { threads.push($(this).attr("id").split("_").pop()) })
            return threads })
        body:
        for (let thread of threads) {
            let posts = await xhrAsync(`t${thread}-1-1`).then((res) => {
                let posts = new Array()
                $("#postlist > div[id^=post_]", res.response).each(function () { posts.push($(this).attr("id").split("_").pop()) })
                return posts
            })
            for (let post of posts) {
                let ts = (new Date()).getTime()
                let score = await xhrAsync(`forum.php?mod=misc&action=rate&tid=${thread}&pid=${post}&infloat=yes&handlekey=rate&t=${ts}&inajax=1&ajaxtarget=fwin_content_rate`).then((res) => {
                    return $("table.dt.mbm td:last", res.response).text()
                })
                if (/^\d+$/.test(score)) { return parseInt(score) }
            }
        }
    }
    function getUserCredit(uid) {
        let creditBox = {
            "30": { step: 0},
            "31": { step: 0},
            "32": { step: 1},
            "33": { step: 2},
            "34": { step: 2},
            "35": { step: 3},
            "36": { step: 3},
            "37": { step: 4},
            "51": { step: 5},
            "52": { step: 0},
        }
        return Promise.all([xhrAsync(`suid-${uid}`), getUserScore()]).then((results) => {
            let gid = $("span.xi2", results[0].response).find("a").attr("href").split("=").pop()
            let credits = creditBox[gid]
            credits.total = results[1]
            return credits
        })
    }
    function getCollections() {
        return xhrAsync(`plugin.php?id=keylol_favorite_notification:favorite_enhance&formhash=${formHash}`).then((res) => {
            let collections = new Array()
            $("#delform", res.response).find("tr").each(function () {
                let quote = formatQuote($("span.favorite_quote.xi1", this).text())
                if (quote) {
                    collections.push({favid: $(this).attr("id").split("_").pop(),
                                      uid: $("[href^='suid']", this).attr("href").split("-").pop(),
                                      quote: quote[0],
                                      remain: quote[1],
                                      score: 0})
                }
            })
            return collections.sort(compare('remain'))
        })
    }
    async function calcScores() {
        return Promise.all([getCollections(), getUserCredit(selfUid)]).then((results) => {
            let total = results[1].total
            while(total > 0 ) {
                if (results[0].length === 0) { break }
                for(let item of results[0]) {
                    if (total < 1) { break } else {
                        if (item.score >= item.remain) { continue }
                        else {item.score++; total--}
                    }
                }
            }
            results[0].forEach(function (item) {item.step = results[1].step})
            return results[0]
        })
    }
    function getUserReplys(uid, page=1) {
        return xhrAsync(`home.php?mod=space&uid=${uid}&do=thread&view=me&from=space&type=reply&order=dateline&page=${page}`).then((res) => {
            let replys = new Array()
            $("#delform", res.response).find("td.xg1").each(function () {
                let urlParams = new URLSearchParams($(this).find("a").attr("href"))
                replys.push({tid: urlParams.get("ptid"),
                              pid: urlParams.get("pid")})
            })
            return replys
        })

    }
    function formatQuote(quote, addend=0) {
        let quote_num = quote.match(/\d+/g)
        if (/^\d+\/\d+$/.test(quote) && parseInt(quote_num[0]) < parseInt(quote_num[1])) {
            return [(parseInt(quote_num[0]) + parseInt(addend)).toString() + '/' + quote_num[1].toString(), (parseInt(quote_num[1]) - parseInt(quote_num[0]) - parseInt(addend))]
        } else {
            return
        }
    }
    function updateQuote(favid, quote) {
        const formData = new FormData()
        formData.append("favid", favid)
        formData.append("quote", quote)
        return xhrAsync(`plugin.php?id=keylol_favorite_notification:favorite_enhance&formhash=${formHash}`, "POST", formData).then((res) => {
            return res.responseText
        })
    }
    function rate(tid, pid, score, reason) {
        const formData = new FormData()
        formData.append("formhash", formHash)
        formData.append("tid", tid)
        formData.append("pid", pid)
        formData.append("referer", `${homePage}forum.php?mod=viewthread&tid=${tid}&page=0#pid${pid}`)
        formData.append("handlekey", "rate")
        formData.append("score1", score)
        formData.append("reason", reason)
        return xhrAsync(`forum.php?mod=misc&action=rate&ratesubmit=yes&infloat=yes&inajax=1`, "POST", formData).then((res) => {
            console.log(res)
            if (res.responseText.indexOf('succeedhandle_rate') !== -1) {
                console.log('tid:'+ tid, 'pid:' + pid, 'score:' + score, 'reason:' + reason)
                return ('successful')
            } else if (res.responseText.indexOf('errorhandle_rate') && res.responseText.indexOf('24 小时评分数超过限制')) {
                return ('exceeded')
            } else if (res.responseText.indexOf('errorhandle_rate') && res.responseText.indexOf('您不能对同一个帖子重复评分')) {
                return ('failed')
            } else {
                return ('Unknown')
            }
        })
    }
    async function main() {
        let message = []
        body:
        for (let item of await calcScores()) {
            leg:
            for(let page = 1; page < 30; page++) {
                for(let reply of await getUserReplys(item.uid, page)) {
                    if (item.score > 0) {
                        let attend = Math.min(item.step, item.score)
                        let new_quote = formatQuote(item.quote, attend)[0]
                        let rate_result = await rate(reply.tid, reply.pid, attend, new_quote)
                        if (rate_result === 'successful') {
                            item.score -= attend
                            item.quote = new_quote
                            message.push(`tid: ${reply.tid}  pid: ${reply.pid} score: ${attend} reason:${new_quote}\n`)
                        } else if (rate_result === 'exceeded') {
                            updateQuote(item.favid, item.quote)
                            message.push('无剩余体力,24小时评分数超过限制\n')
                            break body
                        }
                    } else {
                        updateQuote(item.favid, item.quote)
                        break leg
                    }
                }
            }
        }
        alert(message.join(''))
    }
    function views() {
        let rateDiv = $('<div/>', {id: 'rateDiv'})
        let rateBtn = $('<a/>', {
            id: 'autoRate',
            text: 'AutoRate',
            class: 'btn btn-user-action',
            mouseover: function () { $(this).css({'background-color': '#57bae8', 'color': '#f7f7f7'}) },
            mouseleave: function () { $(this).css({'background-color': '', 'color': ''}) },
            click: function () { main() }})
        rateDiv.append(rateBtn)
        $('#nav-search-bar').after(rateDiv)
    }
    views()
})();