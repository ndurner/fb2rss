/*
    fb2rss.js - Turn public Facebook timelines into RSS
    Copyright (C) 2014-2018  Nils Durner

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

async function writeRSSHeader(dst, page, doc, dt)
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
    await page.waitFor("//div[contains(@role, 'article') and not(contains(@class, 'UFIRow'))]");
    
    var baseURL = page.url();
    baseURL = baseURL.substring(0, baseURL.lastIndexOf("/"));
    
    console.log("page opened");

    const fb = await page.$('body');

    const pageTitle = await page.title();
    console.log("operating on page: " + pageTitle);
    
    if (pageTitle == '') {
	console.log("empty page returned");
	process.exit(1);
    }

    var dst = fs.openSync(destFN, "w");
    var name = pageTitle;
    var articles = await page.$$("div[role *= 'article']:not(.UFIRow)");
    var lastEntry;
    
    if (!articles) {
      console.log("Could not load articles\n");
      process.exit(1);
    }

    var date = await page.evaluate(() => {
      return document.querySelector("abbr[data-utime]").getAttribute("data-utime");
    });
    if (date) {
      lastEntry = new Date(1000 * date);
    }
    
    await writeRSSHeader(dst, page, fb, lastEntry);

    console.log("articles: " + articles.length);
    for (var articleIdx = 0; articleIdx < articles.length; articleIdx++) {
      var article = articles[articleIdx];
      var title = undefined;
      var content = undefined;
      var dt = undefined;
      var guid = undefined;

      var articleUrl = await page.evaluate(article => {
	return (article.getElementsByTagName("abbr")[0]).parentNode.getAttribute("href");
	}, article);
      var dto = await page.evaluate(article => {
	return (article.getElementsByTagName("abbr")[0]).getAttribute("data-utime");
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
	  dto = document.evaluate("string(//abbr[name(..) = 'a']/../@data-utime)", articles[olderIdx]).stringValue;
	  if (dto)
	    break;
	}
	* */
	console.log("FIXME: NO DATE");
	
	if (dto)
	  dt = new Date(1000 * dto);
	else
	  dt = lastEntry;
      }

      // remove user comments
      await page.evaluate(article => {
	var comments = article.querySelector("form");
	if (comments)
	  comments.parentNode.removeChild(comments);
      }, article);
	  
      // extract content
      var userContent = await page.evaluate(article => {
	var userContent = article.querySelector("[class ~= 'userContent']");
	if (userContent)
	  userContent = userContent.querySelector("p");
	  
	return userContent ? userContent.innerText : "";      
      }, article);
      
      content = await page.evaluate(article => {
	return {
	    text: article.innerText,
	    html: article.innerHTML
	  };
      }, article);
      
      if (userContent)
	title += ": " + userContent;
      else
	title = content.text;
       
      // use content hash key as GUID if nothing else unique is available
      if (!guid)
	guid = hash(baseURL + title + dt);
      
      writeItem(dst, articleUrl, dt, title, content.html, guid);
    }
    
    writeRSSFooter(dst);

    fs.close(dst);
    process.exit(0);
  }
  catch(error) {
    console.error("saveRSS() failed: " + error);
    process.exit(1);
  }
}

(async () => {
  if (process.argv.length < 4) {
    console.log("Usage: nodejs fb2rss.js url destination.rss");
    process.exit(1);
  }

  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch();

  var url = process.argv[2];
  var dest = process.argv[3];
  
  return saveRSS(url, dest);
})();
