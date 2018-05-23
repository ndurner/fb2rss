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


const fs = require('fs');

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

async function writeRSSHeader(dst, page, dt)
{
  try {
    var desc = await page.evaluate(() => {
  return document.querySelector("meta[name='description']").getAttribute("content");
      });  
    
    fs.writeSync(dst,
      "<?xml version=\"1.0\" encoding=\"UTF-8\" ?>" +
      "<rss version=\"2.0\">" +
      "<channel>" +
      " <title>" + await page.title() + "</title>" +
      " <description>" + desc + "</description>" +
      " <link>" + page.url() + "</link>"
    );

    if (dt)
      fs.writeSync(dst,
  " <lastBuildDate>" + dt.toUTCString() + "</lastBuildDate>" +
  " <pubDate>" + dt.toUTCString() + "</pubDate>\n"
      );
  }
  catch(error) {
    console.error("writing RSS header failed: " + error);
  }
}

function writeRSSFooter(dst)
{
  try {
    fs.writeSync(dst,
      " </channel>" +
      "</rss>"
    );
  }
  catch(error) {
    console.error("writing RSS footer failed: " + error);
  }
}

function writeItem(dst, link, dt, title, content, guid)
{
  try {
    var dstr;
    
    if (dt)
      dstr = " <pubDate>" + dt.toUTCString() + "</pubDate>";
    else {
      dstr = "";
      console.log("no date: " + title);
    }
    
    fs.writeSync(dst,
      " <item>" +
      " <title><![CDATA[" + title + "]]></title>" +
      " <description><![CDATA[" + content + "]]></description>" +
      " <link><![CDATA[" + link + "]]></link>" +
      " <guid isPermaLink=\"false\"><![CDATA[" + guid + "]]></guid>" +
      dstr +
      " </item>\n"
    );
  }
  catch(error) {
    console.error("writing RSS item failed: " + error);
    process.exit(1);
  }
}

async function saveRSS(url, destFN)
{
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    await page.setViewport({width: 1920, height: 1050});
    
    console.log("opening " + url);
    await page.goto(url, {waitUntil: 'domcontentloaded'});
	await page.waitFor("//li[@data-item-type = 'tweet']");
	{
      var baseURL = page.url();
      baseURL = baseURL.substring(0, baseURL.lastIndexOf("/"));
      
      console.log("page opened");
      
      console.log("operating on page: " + await page.title());
      
      var pageTitle = await page.evaluate(() => {
          return document.body.querySelector("h1[class ~= 'ProfileHeaderCard-name']").firstElementChild.text;
        });

      var dst = fs.openSync(destFN, "w");
      var name = pageTitle;
      var articles = await page.$x("//li[@data-item-type = 'tweet' and ../@class != 'activity-popup-users']");
      var lastEntry;
      
      if (!articles) {
        console.log("Could not load articles\n");
        process.exit(1);
      }
      
      var date = await page.evaluate(() => {
        var d = document.body.querySelector("span[data-time]");
        if (d)
            d = d.getAttribute("data-time");
        return d;
      });
      if (date) {
        lastEntry = new Date(1000 * date);
      }
      
      await writeRSSHeader(dst, page, lastEntry);
      
      console.log("articles: " + articles.length);
      
      for (var articleIdx = 0; articleIdx < articles.length; articleIdx++) {
        var article = articles[articleIdx];
        var title = undefined;
        var content = undefined;
        var dt = undefined;
        var guid = undefined;

        var dto = await page.evaluate(article => {
            var d = article.querySelector("span[data-time]");
            if (d)
                d = d.getAttribute("data-time");
            return d;
        }, article);
        var articleUrl = await page.evaluate(article => {
            var a = article.querySelector("a[class ~= 'js-permalink']");
            if (a)
                a = a.getAttribute("href");
            return a;
        }, article);
                
        if (articleUrl) {
          if (articleUrl.substring(0, 1) == "/")
            articleUrl = baseURL + articleUrl;
            
          guid = articleUrl;
        }
        else
          articleUrl = url;

        title = name;

        if (dto)
          dt = new Date(1000 * dto);
        else {
          // look ahead to find an older article that does have a date set
		  // FIXME
		  /*
          for (var olderIdx = articleIdx + 1; olderIdx < articles.length; olderIdx++) {
            dto = article.querySelector("span[data-time]");
            if (dto)
              break;
          }
		  */
		  	console.log("FIXME: NO DATE");
          
          if (dto)
            dt = new Date(1000 * dto);
          else
            dt = lastEntry;
        }
        
        // read content
	var userContent = await page.evaluate(article => {
            return article.querySelector("[class ~= 'tweet']");
        }, article);

        if (userContent) {
            var txtHTML = await page.evaluate(article => {
                var t = article.querySelector("[class ~= 'tweet-text']");
                if (t)
                    t = t.innerHTML;
                return t;
            }, article);
            var txt = await page.evaluate(article => {
                var t = article.querySelector("[class ~= 'tweet-text']");
                if (t)
                    t = t.textContent;
                return t;
            }, article);

            var pic = await page.evaluate(article => {
                var p = article.querySelector("[data-element-context = 'platform_photo_card']");
                if (p) {
                    var inner = p.querySelector("img");
                    if (inner)
                        p = inner;
                }
                return p ? p.outerHTML : null;
            }, article);

            var isRT = await page.evaluate(article => {
                return article.querySelector("[class ~= 'js-retweet-text']");
            }, article);
            var isQT = await page.evaluate(article => {
                return article.querySelector("[class ~= 'QuoteTweet-authorAndText']");
            }, article);
            var rt = "";
                    
            if (isRT) {
               rt = await page.evaluate(article => {
                   var r = article.querySelector("[class ~= 'username']");
                   if (r)
                       r = "RT " + r.textContent + ": ";
                   return r;
               }, article);
            }

          content = "<div>" + rt + txt + "</div>";

          if (pic)
            content += "<div>" + pic + "</div>";

          if (isQT) {
            var qt = await page.evaluate(article => {
                return article.querySelector("[class ~= 'QuoteTweet-text']");
            }, article);

            if (qt)
              content += ("<div>" + qt.textContent + "</div>");
          }

          title += ": " + rt + txt;
        }
        
        // use content hash key as GUID if nothing else unique is available
        if (!guid)
          guid = hash(baseURL + title + dt);
        
        writeItem(dst, articleUrl, dt, title, content, guid);
      }
      
      writeRSSFooter(dst);

      fs.close(dst);
      process.exit(0);
    }
  }
  catch(error) {
    console.error("saveRSS() failed: " + error.stack);
    process.exit(1);
  }
}

(async () => {
  if (process.argv.length < 4) {
    console.log("Usage: nodejs tw2rss.js url destination.rss");
    process.exit(1);
  }

  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch();

  var url = process.argv[2];
  var dest = process.argv[3];
  
  return saveRSS(url, dest);
})();
