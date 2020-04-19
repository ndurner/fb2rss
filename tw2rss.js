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
        var descNode = document.querySelector("div[data-testid='UserDescription']");
        return descNode ? descNode.textContent : "";
      });  
    
    fs.writeSync(dst,
      "<?xml version=\"1.0\" encoding=\"UTF-8\" ?>" +
      "<rss version=\"2.0\">" +
      "<channel>" +
      " <title><![CDATA[" + await page.title() + "]]></title>" +
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
    
    page.on('console', msg => {
		for (let i = 0; i < msg.args().length; ++i)
			console.log(`${i}: ${msg.args()[i]}`);
	});
    
    await page.setViewport({width: 6016, height: 3384});
    
    console.log("opening " + url);
    await page.goto(url, {waitUntil: 'networkidle0'});
	await page.waitFor("//article");
	{
      var baseURL = page.url();
      baseURL = baseURL.substring(0, baseURL.lastIndexOf("/"));
      
      console.log("page opened");
      
      console.log("operating on page: " + await page.title());
      
      var pageTitle = await page.title();
      pageTitle = pageTitle.substring(0, pageTitle.indexOf('(') - 1);

      var dst = fs.openSync(destFN, "w");
      var name = pageTitle;
      var articles = await page.$x("//article");
      
      if (!articles) {
        console.log("Could not load articles\n");
        process.exit(1);
      }
      
      var lastEntry = await page.evaluate(() => {
        var timeNodes = document.body.querySelectorAll("time");
        var d = new Date(0);
        
        timeNodes.forEach(time => {
			var t = new Date(time.getAttribute("datetime"));
			
			if (t > d)
				d = t;
		});

        return JSON.stringify(d);
      });
      lastEntry = new Date(JSON.parse(lastEntry));
      
      await writeRSSHeader(dst, page, lastEntry);
      
      console.log("articles: " + articles.length);
      
      for (var articleIdx = 0; articleIdx < articles.length; articleIdx++) {
        var article = articles[articleIdx];
        var title = undefined;
        var content = undefined;
        var dt = undefined;
        var guid = undefined;

        var dto = await page.evaluate(article => {
            var d = article.querySelector("time");
            if (d)
                d = d.getAttribute("datetime");
            return d;
        }, article);
        var articleUrl = await page.evaluate(article => {
            var as = article.querySelectorAll("a[href *= 'status']");
            if (as) {
				as.forEach(a => {
					if (!a.getAttribute("label"))
						retval = a.getAttribute("href");
				});
			}
            return retval;
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
          dt = new Date(dto);
        else {
		  dt = lastEntry;
        }
        
        // read content
		var userContent = article;

        if (userContent) {
            var txtHTML = await page.evaluate(t => {
                if (t)
                    t = t.innerHTML;
                return t;
            }, article);
            var txt = await page.evaluate(t => {
				var lang = t.querySelector("div[lang]");
				
                if (lang)
					t = lang.textContent;
                else
                    t = t.textContent;
                return t;
            }, article);

            var isRT = await page.evaluate(article => {
				var retval = false;
				article.querySelectorAll("a").forEach(a => {
					retval |= a.textContent.includes("Retweeted");
				});
				
                return retval;
            }, article);
                    
            if (isRT) {
               rt = " RT";
            }
            else
				rt = "";

          title += rt + ": " + txt;
        }
        
        // use content hash key as GUID if nothing else unique is available
        if (!guid)
          guid = hash(baseURL + title + dt);
        
        writeItem(dst, articleUrl, dt, title, txtHTML, guid);
      }
      
      writeRSSFooter(dst);

      fs.close(dst, fu => {});
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
