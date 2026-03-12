/* ═══════════════════════════════════════
   favoriti.js — Lista omiljenih pesama
   ═══════════════════════════════════════ */

var PIN_SVG = '<svg viewBox="0 0 100 100" fill="none"><g stroke="#000" stroke-width="6" stroke-linecap="round"><line x1="50" y1="4" x2="50" y2="13"/><line x1="65.3" y1="6.7" x2="61.7" y2="15.1"/><line x1="78.3" y1="14.6" x2="72.3" y2="20.6"/><line x1="86.7" y1="26.7" x2="78.5" y2="30.3"/><line x1="89.5" y1="41" x2="80.5" y2="41"/><line x1="34.7" y1="6.7" x2="38.3" y2="15.1"/><line x1="21.7" y1="14.6" x2="27.7" y2="20.6"/><line x1="13.3" y1="26.7" x2="21.5" y2="30.3"/><line x1="10.5" y1="41" x2="19.5" y2="41"/></g><path d="M50 22 C35 22 24 33 24 46 C24 60 50 82 50 82 C50 82 76 60 76 46 C76 33 65 22 50 22Z" stroke="#000" stroke-width="5" fill="none"/><circle cx="50" cy="46" r="10" stroke="#000" stroke-width="5" fill="none"/><circle cx="50" cy="46" r="3.5" fill="#000"/></svg>';

function renderFavs() {
  var n = favorites.length;
  document.getElementById('fav-count').textContent = n===0?'0 sačuvanih pesama':n===1?'1 sačuvana pesma':n+' sačuvanih pesama';
  document.getElementById('fav-empty').style.display = n?'none':'block';
  var exportBtn = document.getElementById('fav-export-btn');
  if(exportBtn) exportBtn.style.display = n ? 'block' : 'none';
  document.getElementById('fav-list').innerHTML = favorites.map(function(f,i){
    var rawQ = encodeURIComponent(f.artist ? f.artist+' '+f.title : f.title);
    return '<div class="fav-item" style="flex-direction:column;align-items:stretch;gap:10px;">'+
      '<div style="display:flex;align-items:center;gap:14px;">'+
        '<div class="fav-thumb-sm">'+PIN_SVG+'</div>'+
        '<div class="fav-info"><div class="fav-title">'+esc(f.title)+'</div><div class="fav-artist">'+esc(f.artist)+'</div></div>'+
        '<button class="fav-del" onclick="delFav('+i+')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'+
      '</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">'+
        '<a href="https://music.apple.com/search?term='+rawQ+'" target="_blank" style="flex:1;min-width:70px;text-align:center;justify-content:center;padding:7px 8px;border-radius:10px;border:1px solid var(--border2);font-size:11px;font-weight:700;color:var(--text2);text-decoration:none;display:flex;align-items:center;">Apple Music</a>'+
        '<a href="https://www.deezer.com/search/'+rawQ+'" target="_blank" style="flex:1;min-width:70px;text-align:center;justify-content:center;padding:7px 8px;border-radius:10px;border:1px solid var(--border2);font-size:11px;font-weight:700;color:var(--text2);text-decoration:none;display:flex;align-items:center;">Deezer</a>'+
        '<a href="https://open.spotify.com/search/'+rawQ+'" target="_blank" style="flex:1;min-width:70px;text-align:center;justify-content:center;padding:7px 8px;border-radius:10px;border:1px solid var(--border2);font-size:11px;font-weight:700;color:var(--text2);text-decoration:none;display:flex;align-items:center;">Spotify</a>'+
        '<a href="https://music.youtube.com/search?q='+rawQ+'" target="_blank" style="flex:1;min-width:70px;text-align:center;justify-content:center;padding:7px 8px;border-radius:10px;border:1px solid var(--border2);font-size:11px;font-weight:700;color:var(--text2);text-decoration:none;display:flex;align-items:center;">YouTube Music</a>'+
      '</div>'+
    '</div>';
  }).join('');
}

function exportFavs() {
  if(!favorites.length) return;
  var lines = ['radioAPARAT — Moje omiljene pesme', ''];
  favorites.forEach(function(f,i){
    lines.push((i+1)+'. '+(f.artist?f.artist+' — ':'')+f.title);
  });
  lines.push('', 'radioaparat.rs');
  var blob = new Blob([lines.join('\n')], {type:'text/plain;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'radioAPARAT-favoriti.txt';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function delFav(i) { favorites.splice(i,1); saveFavs(); renderFavs(); checkFav(); }
