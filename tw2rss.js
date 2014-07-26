/*
    tw2rss.js - Turn public Twitter timelines into RSS
    Copyright (C) 2014  Nils Durner

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var fs = require("fs");
var system = require('system');
var phantom = window.phantom;

function errorHandler(msg, trace)
{
    var msgStack = ['PHANTOM ERROR: ' + msg];
    if (trace && trace.length) {
        msgStack.push('TRACE:');
        trace.forEach(function(t) {
            msgStack.push(' -> ' + (t.file || t.sourceURL) + ': ' + t.line + (t.function ? ' (in function ' + t.function + ')' : ''));
        });
    }
    console.error(msgStack.join('\n'));
    window.setTimeout(function() {
      phantom.exit(1);
    }, 500);
};

function hash(s)
{
  var h = new Uint8Array(16);
  
  for (var i = 0; i < s.length; i++) {
    var carry;
    for (var j = h.length - 1; j >= 0; j--) {
      var ch = h[j];
      var newCarry = ch >> 5;
      ch = (ch << 3) | carry;
      carry = newCarry;
      h[j] = ch ^ h[j];
    }
    
    h[h.length - 1] ^= s.charCodeAt(i);
  }
  
  var str = "";
  var a = "a".charCodeAt(0);
  for (var i = 0; i < h.length; i++) {
    var n = h[i];
    str = str + String.fromCharCode(a + (n & 0xF)) +
      String.fromCharCode(a + (n >> 4));
  }
  
  return str;
}

function writeRSSHeader(dst, page, doc, dt)
{
  var desc = page.evaluate(function (s) {
      return document.head.querySelector("meta[name='description']").getAttribute("content");
    });  
  
  dst.write(
    "<?xml version=\"1.0\" encoding=\"UTF-8\" ?>" +
    "<rss version=\"2.0\">" +
    "<channel>" +
    " <title>" + page.title + "</title>" +
    " <description>" + desc + "</description>" +
    " <link>" + page.url + "</link>"
  );
  if (dt)
    dst.write(
      " <lastBuildDate>" + dt.toUTCString() + "</lastBuildDate>" +
      " <pubDate>" + dt.toUTCString() + "</pubDate>\n"
    );
}

function writeRSSFooter(dst)
{
  dst.write(
    " </channel>" +
    "</rss>"
  );
}

function writeItem(dst, link, dt, title, content, guid)
{
  var dstr;
  
  if (dt)
    dstr = " <pubDate>" + dt.toUTCString() + "</pubDate>";
  else {
    dstr = "";
    console.log("no date: " + title);
  }
  
  dst.write(
    " <item>" +
    " <title><![CDATA[" + title + "]]></title>" +
    " <description><![CDATA[" + content + "]]></description>" +
    " <link><![CDATA[" + link + "]]></link>" +
    " <guid isPermaLink=\"false\"><![CDATA[" + guid + "]]></guid>" +
    dstr +
    " </item>\n"
  );
}

function saveRSS(url, destFN)
{
  var webpage = require("webpage");
  var page = webpage.create();
  
  page.onError = errorHandler;
  
  console.log("opening " + url);
  page.open(url, function() {
    setTimeout(function() {
      var baseURL = page.url;
      baseURL = baseURL.substring(0, baseURL.lastIndexOf("/"));
      
      console.log("page opened");
      
      document.body.innerHTML = page.content;
      var fb = document.body;

      console.log("operating on page: " + page.title);
      
      var pageTitle = page.evaluate(function (s) {
          return document.body.querySelector("h1[class ~= 'ProfileHeaderCard-name']").firstElementChild.text;
        });

      var dst = fs.open(destFN, "w");
      var name = pageTitle;
      var articles = fb.querySelectorAll("[class ~='ProfileTweet']");
      var lastEntry;
      
      if (!articles) {
        console.log("Could not load articles\n");
        phantom.exit(1);
      }
      
      var date = fb.querySelector("span[data-time]");
      if (date) {
        lastEntry = new Date(1000 * date.getAttribute("data-time"));
      }
      
      writeRSSHeader(dst, page, fb, lastEntry);
      
      console.log("articles: " + articles.length);
      
      for (var articleIdx = 0; articleIdx < articles.length; articleIdx++) {
        var article = articles[articleIdx];
        var title = undefined;
        var content = undefined;
        var dt = undefined;
        var guid = undefined;
        
        var dto = article.querySelector("abbr[span-time]");
        var articleUrl = article.querySelector("a[class ~= 'js-permalink']");
        
        if (articleUrl) {
          articleUrl = articleUrl.getAttribute("href");
          if (articleUrl.substring(0, 1) == "/")
            articleUrl = baseURL + articleUrl;
            
          guid = articleUrl;
        }
        else
          articleUrl = url;

        title = name;

        if (dto)
          dt = new Date(1000 * dto.getAttribute("data-time"));
        else {
          // look ahead to find an older article that does have a date set
          for (var olderIdx = articleIdx + 1; olderIdx < articles.length; olderIdx++) {
            dto = article.querySelector("abbr[data-time]");
            if (dto)
              break;
          }
          
          if (dto)
            dt = new Date(1000 * dto.getAttribute("data-time"));
          else
            dt = lastEntry;
        }
        
        // read content
        var userContent = article.querySelector("[class = 'ProfileTweet-contents']");

        if (userContent) {
          var txt = userContent.querySelector("[class ~= 'ProfileTweet-text']");
          var pic = article.querySelector("[class ~= 'TwitterPhoto-media']");
          var isRT = article.querySelector("[class ~= 'js-retweet-text']");
          var rt = "";
                    
          if (isRT) {
            rt = article.querySelector("[class ~= 'ProfileTweet-originalAuthor']");
            if (rt)
              rt = "RT " + rt.querySelector("[class ~= 'ProfileTweet-screenname']").textContent + ": ";
          }

          content = "<div>" + rt + txt.innerHTML + "</div>";

          if (pic) {
            var innerPic = pic.querySelector("img[class ~= 'TwitterPhoto-mediaSource']");
            if (!innerPic)
              innerPic = pic;
            content += "<div>" + innerPic.outerHTML + "</div>";
          }        


          title += ": " + rt + txt.textContent;
        }
        
        // use content hash key as GUID if nothing else unique is available
        if (!guid)
          guid = hash(baseURL + title + dt);
        
        writeItem(dst, articleUrl, dt, title, content, guid);
      }
      
      writeRSSFooter(dst);

      dst.close();
      phantom.exit(0);  
    }, 1500);
  });
}

{
  var args = system.args;
  
  if (args.length === 1) {
    console.log('Usage: phantomjs tw2rss.js url destination.rss');
    phantom.exit(1);
  }
  
  var url = args[1];
  var dest = args[2];
  
  phantom.onError = errorHandler;
  
  saveRSS(url, dest);
}