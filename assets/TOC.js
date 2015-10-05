/**
 * Created by grant skinner on 15-10-01.
 * Simple script to build a Table Of Contents from the document structure.
 */
(function() {
if (document.readyState === "complete") { buildTOC(); }
else { window.addEventListener("load", buildTOC); }

function buildTOC() {
	var headers = document.querySelectorAll("h1, h2");
	var toc = document.getElementById("toc");
	var ul = document.createElement("ul");
	ul.className = "toc";
	toc.appendChild(ul);
	var anchors = {};
	for (var i = 0; i < headers.length; i++) {
		var h = headers[i], j = 0;
		var level = parseInt(h.nodeName[1]);
		var name = (h.textContent || h.innerText).replace(/\W/g, ""), id = name;
		while (anchors[id]) { anchor = name + "_" + (j++); }
		var a = document.createElement("a");
		a.setAttribute("name", id);
		a.setAttribute("id", id);
		h.parentNode.insertBefore(a, h);

		var li = document.createElement("li");
		li.className = "toc" + level;
		a = document.createElement("a");
		a.setAttribute("href", "#" + id);
		a.innerHTML = h.textContent;
		li.appendChild(a);
		ul.appendChild(li);
	}
}
})();