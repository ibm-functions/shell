/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * This plugin implements a simple in-page text search, using Chrome's findInPage API.
 *
 */
const app = require('electron');
module.exports = () => {
    if (typeof document === 'undefined') return // return if no document
    ui.injectCSS('plugins/ui/commands/text-search.css'); // inject css    
    // insert html
    let b = document.createElement('div');
    b.style.display='none'; b.setAttribute('id', 'search-bar');    
    b.innerHTML = "<div id='search-container'><input id='search-input' placeholder='enter search term' onfocus='this.select();' onmouseup='return false;'/> <span id='search-found-text'></span></div>";
    document.getElementsByClassName('page')[0].insertBefore(b, document.getElementsByTagName('main')[0]);
    

    const searchBar = document.getElementById('search-bar'),
        searchInput = document.getElementById('search-input'),
        searchFoundText =  document.getElementById('search-found-text');    

    const searchText = value => {
        app.remote.getCurrentWebContents().findInPage(value);   // findInPage handles highlighting matched text in page
    }
    const stopSearch = (clear) => {        
        app.remote.getCurrentWebContents().stopFindInPage('clearSelection');    // clear selections in page          
        if(clear)
            setTimeout(() => {ui.getCurrentPrompt().focus()}, 300);  // focus repl text input      
    }

    app.remote.getCurrentWebContents().on('found-in-page', (event, result) => {                
        if (!result.finalUpdate) {
          return;
        }
        const v = searchInput.value;    // because findInPage also highlights the searchInput text, we clear it first
        searchInput.value = '';
        searchInput.value = v; 
        searchInput.focus();
        if(result.matches == 1){        // there's always going to one matched text from the searchInput
            searchFoundText.innerText = 'no matches';
        }        
        else{
            searchFoundText.innerText = (result.matches-1)+' matches';
        }

    });    

    searchInput.addEventListener('click', e => {
        searchInput.focus();   
    });
    searchInput.addEventListener('keyup', e => {        
        if(e.key == 'Enter'){  // search when Enter is pressed and there is text in searchInput
            if(searchInput.value.length > 0){
                searchText(searchInput.value);        
            }
            else{
                searchFoundText.innerHTML = '';
                stopSearch(true);
            }
        }
        else if(e.key == 'Escape'){ // esc closes the search tab (when search tab is focus) 
            e.stopPropagation();    // stop event propagating to other dom elements - only affect the search bar
            searchBar.style.display = 'none';
            searchFoundText.innerHTML = '';
            stopSearch(true);         
        }      
    });

    document.getElementsByTagName('body')[0].addEventListener('keydown', function(e){
        if(e.keyCode == 70 && ((e.ctrlKey && process.platform !== 'darwin') || (e.metaKey && process.platform == 'darwin'))){    // ctrl/cmd-f opens search
            searchBar.style.display = 'block';
            searchInput.focus();    // searchInpus focused when opened
        }        
    });

    window.onbeforeunload = e => {
        stopSearch(false);   // before reloading, clear all highlighted matched text 
        app.remote.getCurrentWebContents().removeAllListeners('found-in-page'); // remove listner
    }

}
