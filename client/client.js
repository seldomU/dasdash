'use strict';
import {
  createButton,
  createDomNode,
  createNotification,
  createDropdownButton,
  createConfirmationDialog,
  createTextInput,
  isConfirmed,
  createText,
  createTooltip,
  createDiv,
  iconHTML,
  htmlEscape
} from '/util/uiComponents.js';

import {
  requireScript
} from '/util/requireScript.js';

import isValidFilename from '/util/isValidFilename.js';
import Sortable from '/vendor/sortable.1.15.0.esm.min.js';

// DOM element ids
const dashTitleContainerId = "dashTitleContainer";
const dashTitleId = "dashTitle";
const dashTitleEditId = "dashTitleEdit";
const sidebarMenuId = "sidebar-menu";
const sidebarFooterId = "sidebar-footer";
const contentAreaId = "contentArea";
const footerId = "footer";
const titleContainerId = "titleContainer";
const titleId = "pageTitle";
const titleEditId = "pageTitleEdit";

// preparing for i18n
const Msgs = {
  emptyBoardTitle: "empty dashboard",
  emptyBoardText: "This dashboard is empty. Add your first page.",
  emptyBoardAddPageLabel: "Add page",
  emptyBoardAddPageTip: "Adds a page to your dashboard.",
  emptyPageText: "This page has no cells. Add one with the button below.",
  notifyError: "Error",
  notifyPageNotFound: "Page not found: ",
  invalidPageName: "Please pick a different name. No two pages can be named the same. Some characters are not allowed in names, like <code> \< \> : \" / \\ | ? * </code>.",
  invalidCellName: "Please pick a different name. No two cells of a page can be named the same. Some characters are not allowed in names, like <code> \< \> : \" / \\ | ? * </code>.",
  pageNameMissing: "The page needs a name.",
  renameBoardModalTitle: "Rename dashboard",
  renameBoardModalInputLabel: "Board name",
  renameBoardModalInputPlaceholder: "your dashboard name",
  renameBoardModalNameMissing: "The board title can't be empty.",
  boardNameMissing: "The board needs a name.",
  renameBoardFailed: "Failed to change board name.",
  renamePageModalTitle: "Rename page",
  renamePageModalInputLabel: "Page name",
  renamePageModalInputPlaceholder: "your page name",
  addPageModalTitle: "Add page",
  addPageModalInputLabel: "page name",
  addPageModalInputPlaceholder: "your page name",
  addPageBtnTip: "Adds a new page to the dashboard.",
  editConstsBtnLabel: "Edit consts",
  editConstsBtnTip: "Allows you to edit the dashboard's constants.",
  reloadBoardBtnLabel: "Reset",
  reloadBoardBtnTip: "Reloads the dashboard's data.",
  addCellBtnLabel: "add cell",
  addCellBtnTip: "Appends a cell to the page",
  addCellModalTitle: "Add cell",
  addCellModalInputLabel: "Cell name",
  addCellModalInputPlaceholder: "your cell name",
  deletePageBtnLabel: "delete page",
  deletePageModalTitle: "Remove page",
  deletePageModalText: "Really remove this page and all its content?",
  deletePageBtnTip: "Removes this page from the dashboard",
  cellDragHandleTip: "Drag the cell to move it up or down.",
  cellNameEditTip: "Edit the cell name.",
  cellNameModalTitle: "Cell name",
  cellNameModalInputLabel: "Name",
  cellNameModalInputPlaceholder: "your cell name",
  cellHeaderMenuTip: "Cell controls menu</br>Double click = edit cell",
  cellHeaderMenuEdit: "edit content",
  cellHeaderMenuRemoveCell: "remove cell",
  deleteCellModalTitle: "Delete cell",
  deleteCellModalText: "Really delete cell?",
  constsEditorTitle: "Constants editor",
  constsEditorConfirmLabel: "Save changes",
  constsEditorParseError: "Consts have to be in valid JSON format.",
  constsEditorHeader: "Define constants",
  cellEditorTitle: "Cell code editor",
  cellEditorConfirmLabel: "Save changes",
  badCellType: "Unhandled cell type: ",
  httpError: "Http error: ",
  fetchError: "fetch error: ",
  jsonParseError: "failed to parse JSON: "
}

window.addEventListener('load', async () => {

  window._loadedUrls = {};
  let { json: baseData } = await fancyFetch('/api/board/basicdata', {}, FetchType.json);

  window.userConsts = baseData.userConsts;
  window.consts = Object.assign(
    {}, 
    baseData.userConsts,
    baseData.extraConsts,
    baseData.sysConsts
  );

  if (!baseData.pages.length) {
    document.title = Msgs.emptyBoardTitle;
    populateDashTitle( baseData.title );
    populateFreshDashboard();
    populateSidebar(baseData.pages, "");  // don't await
    return;
  }
  // populate content area from the active page's content
  let activePage = null;
  let activePageName = (new URLSearchParams(location.search)).get('page');

  if (activePageName) {
    activePage = baseData.pages.find(p => p.name == activePageName);
    if (!activePage) {
      createNotification(Msgs.notifyError, Msgs.notifyPageNotFound + activePageName);
    }
  }

  if (!activePage) {
    activePage = baseData.pages[0];
  }

  document.title = baseData.title + " - " + activePage.name;

  populateDashTitle( baseData.title );
  populateContentArea(activePage); // don't await

  // populate sidebar from pages
  populateSidebar(baseData.pages, activePage);  // don't await

  populatePageTitle(baseData.pages, activePage.name);
});

// adds content for a board that has no pages yet
function populateFreshDashboard() {
  let contentContainer = document.getElementById(contentAreaId);
  createText(contentContainer, Msgs.emptyBoardText);
  createButton(
    contentContainer,
    iconHTML("execute") + Msgs.emptyBoardAddPageLabel,
    () => addPageDialog([]),
    { tip: Msgs.emptyBoardAddPageTip }
  )
}

async function populateContentArea(page) {
  let pageName = page.name;
  let cells = page.cells;
  let contentContainer = document.getElementById(contentAreaId);
  fillContentAreaCells(pageName, cells, contentContainer);
  if (cells.length == 0) {
    createText(contentContainer, Msgs.emptyPageText);
  }
  else{
    Sortable.create( contentContainer, {
      handle: ".draghandle",
      group: "cells", // two sortables with the same name can have items moved between them
      onEnd: evt => {
        moveCell( pageName, evt.oldIndex, evt.newIndex );
      }
    });
  }

  // scroll to hash
  // since the page is populated by the client, we have to do it manually
  let focusCell = document.getElementById( window.location.hash.substring(1) );
  if(focusCell){
    setTimeout(()=>{
      focusCell.scrollIntoView({behavior: "smooth"});
    }, 100);
  }

  // populate footer
  let footer = document.getElementById(footerId);

  // "add cell" button
  createButton(
    footer,
    '<img src="/icons/window-plus.svg"/> ' + Msgs.addCellBtnLabel,
    () => {
      let nameInput;
      let errorMsg;
      let dialog = createConfirmationDialog({
        title: Msgs.addCellModalTitle,
        setBody: body => {
          nameInput = createTextInput(
            body,
            {
              label: Msgs.addCellModalInputLabel,
              value: "",
              placeholder: Msgs.addCellModalInputPlaceholder,
              style: "float"
            }
          );
          errorMsg = createText(body, "");
        },
        onConfirm: async () => {
          let isAllowed = isAllowedAsCellName(nameInput.value, "", cells);
          if (isAllowed) {
            dialog.close();
            let pageNameEncoded = encodeURIComponent(pageName);
            let cellNameEncoded = encodeURIComponent(nameInput.value);
            let { error } = await fancyFetch(
              `/api/board/addcell/${pageNameEncoded}/module?name=${cellNameEncoded}`,
              { method: "post" }
            );
            // for errors: leave this page open, so the error notification is readable
            if (!error) {
              loadPage();
            }
          }
          else {
            errorMsg.innerHTML = Msgs.invalidCellName;
          }
        },
        enterConfirms: true
      });

      dialog._element.addEventListener('shown.bs.modal', () => {
        nameInput.focus();
      })
    },
    { 
      tip: Msgs.addCellBtnTip,
      display: "inline-block"
    }
  )

  // delete page button
  createButton(
    footer,
    iconHTML("remove") + Msgs.deletePageBtnLabel,
    async () => {
      let dialog = createConfirmationDialog({
        title: Msgs.deletePageModalTitle,
        setBody: body => {
          body.appendChild(document.createTextNode(Msgs.deletePageModalText));
        },
        onConfirm: async () => {
          dialog.close();
          let { error } = await fancyFetch(
            `/api/board/page/${encodeURIComponent(pageName)}`,
            { method: "delete" }
          );
          // for errors: leave this page open, so the error notification is readable
          if (!error) {
            loadPage(window.location.origin + window.location.pathname);
          }
        },
        enterConfirms: true
      })
    },
    {
      tip: Msgs.deletePageBtnTip,
      display: "inline-block"
    }
  );
}

function fillContentAreaCells(pageName, cells, containerElem) {

  for (let cellId = 0; cellId < cells.length; cellId++) {
    let cell = cells[cellId];

    const cellColumn = document.createElement("div");
    containerElem.appendChild(cellColumn);

    // add a card
    let cellFrameStyle = cell.height ? `style="height:${cell.height}px"` : "";
    let card = createDomNode(`<div class="card rounded-3 my-5 cellCard" ${cellFrameStyle}></div>`);
    cellColumn.appendChild(card);

    // add card header
    let cellHeader = createDomNode(/*html*/`<div class="card-header">
        <div class="container-flex">
          <div class="row">
            <div class="col-10 ps-1">
              <img src="/icons/chevron-expand.svg" class="draghandle me-0 invisible" height="20px" />
              <b class="cellTitle"></b>
              <button class="btn btn-sm d-inline py-0 ps-0 ms-0 mb-2 btn-outline-light invisible">
                <img src="/icons/pencil.svg" height="14px" />
              </button>
            </div>
            <div class="col-2 d-flex align-items-end flex-column"></div>
          </div>
        </div> 
      </div>`);
    card.appendChild(cellHeader);
    let headerCols = cellHeader.querySelector('.row').children;
    // first column is title
    let titleDiv = headerCols[0];
    let titleWrap = titleDiv.querySelector('.cellTitle');
    let encodedName = "cell_" + encodeURIComponent( cell.name.replaceAll(" ", "_") );
    card.id = encodedName;
    let titleAnchor = createDomNode(`<a href="#${encodedName}" class="text-reset text-decoration-none">${cell.name}</a>`);
    titleWrap.appendChild(titleAnchor);
    // second column is menu
    let menuDiv = headerCols[1];

    let nameEditButton = cellHeader.querySelector('button');
    createTooltip(nameEditButton, Msgs.cellNameEditTip );
    let dragHandle = cellHeader.querySelector('.draghandle');
    createTooltip(dragHandle, Msgs.cellDragHandleTip );

    // toggle name edit button on mouse enter/leave
    cellHeader.addEventListener("mouseenter", e => {
      nameEditButton.classList.remove("invisible");
      dragHandle.classList.remove("invisible");
    })
    cellHeader.addEventListener("mouseleave", e => {
      nameEditButton.classList.add("invisible");
      dragHandle.classList.add("invisible");

    })

    nameEditButton.onclick = () => {
      let nameInput;
      let errorMsg;
      let dialog = createConfirmationDialog({
        title: Msgs.cellNameModalTitle,
        setBody: body => {
          nameInput = createTextInput(
            body,
            {
              label: Msgs.cellNameModalInputLabel,
              value: cell.name,
              placeholder: Msgs.cellNameModalInputPlaceholder
            }
          );
          // why wont this work?
          // nameInput.focus();
          // nameInput.select();
          errorMsg = createText(body, "");
        },
        onConfirm: async () => {
          let isAllowed = isAllowedAsCellName(nameInput.value, cell.name, cells);
          if (isAllowed) {
            dialog.close();
            cell.name = nameInput.value;
            titleDiv.querySelector(".cellTitle").textContent = cell.name;
            await fancyFetch(
              `/api/board/updatecell/${encodeURIComponent(pageName)}/${cellId}`,
              {
                method: 'POST',
                headers: {
                  'Accept': 'application/json',
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(cell)
              }
            );
          }
          else {
            errorMsg.innerHTML = Msgs.invalidCellName;
          }
        },
        enterConfirms: true
      })
      dialog._element.addEventListener('shown.bs.modal', () => {
        nameInput.focus();
      })
    }

    // add menu to card header 
    let cellHeaderMenu = createDomNode(`<div class="ml-auto"></div>`);
    menuDiv.appendChild(cellHeaderMenu);
    createTooltip(cellHeaderMenu, {
      title: Msgs.cellHeaderMenuTip,
      placement: "top"
    });
    
    createDropdownButton(
      cellHeaderMenu,
      '<img src="/icons/three-dots.svg" />',
      [
        {
          label: '<img src="/icons/pencil.svg" /> ' + Msgs.cellHeaderMenuEdit,
          action: () => setupCellEditor(pageName, cellId, cellURL(pageName, cell.name), cellColumn, cellFrameContainer)
        },
        {
          label: '<img src="/icons/window-x.svg" /> ' + Msgs.cellHeaderMenuRemoveCell,
          action: async () => {
            let doDelete = await isConfirmed({
              title: Msgs.deleteCellModalTitle,
              setBody: body => {
                body.appendChild(document.createTextNode(Msgs.deleteCellModalText));
              }
            });
            if (doDelete) {
              await removeCell(pageName, cellId);
            }
          }
        }
      ],
      {
        // py-0 to keep the lineheight ok for the title text
        buttonClasses: "btn btn-sm py-0 btn-outline-light"
      }
    );

    // doubleclick shortcut to cell editor
    cellHeaderMenu.ondblclick = ev => {
      setupCellEditor(pageName, cellId, cellURL(pageName, cell.name), cellColumn, cellFrameContainer);
    }

    let cellFrameContainer = createDomNode(`<div class="card-body"></div>`);
    card.appendChild(cellFrameContainer);

    if (cell.type == "module") {
      // add a div that is solely for the content
      let cellContentContainer = document.createElement("div");
      cellFrameContainer.appendChild(cellContentContainer);

      fillCellModule(cellContentContainer, cell.name, cellURL(pageName, cell.name));
    }
    else {
      createNotification(Msgs.notifyError, Msgs.badCellType + cell.type)
    }
  }
}

// load cell module and let it populate the cell
async function fillCellModule(containerDiv, cellName, url) {
  try{
    let module = await import(url);
    await module.createCell(containerDiv);
  }catch(err){
    createNotification(
      `Failed to load cell <i>${cellName}</i>`,
      `${htmlEscape(err.toString())}<p>See console for details.</p>` 
    );
    console.error(`Error while filling cell "${cellName}"`, err);
  }
}

async function populatePageTitle(pages, pageName) {

  if (!pageName) {
    return;
  }

  let titleContainer = document.getElementById(titleContainerId);
  let titleElem = document.getElementById(titleId);
  let titleEditBtn = document.getElementById(titleEditId);
  titleElem.textContent = pageName;

  titleContainer.addEventListener("mouseenter", e => {
    titleEditBtn.classList.remove("invisible");
  });
  titleContainer.addEventListener("mouseleave", e => {
    titleEditBtn.classList.add("invisible");
  });
  titleEditBtn.onclick = () => {
    let nameInput;
    let errorMsg;
    let dialog = createConfirmationDialog({
      title: Msgs.renamePageModalTitle,
      setBody: body => {
        nameInput = createTextInput(
          body,
          {
            label: Msgs.renamePageModalInputLabel,
            value: pageName,
            placeholder: Msgs.renamePageModalInputPlaceholder,
            style: "float"
          }
        );
        errorMsg = createText(body, "");
      },
      onConfirm: async () => {
        let newName = nameInput.value;
        let nameIsAllowed = isAllowedAsPageName(newName, pageName, pages);
        if (nameIsAllowed) {
          dialog.close();
          let success = await renamePage(pageName, newName);
          // for errors: leave this page open, so the notification is readable
          if (success) {
            // page name in sidebar is now invalid
            loadPage(window.location.origin + window.location.pathname + getPageQuery(newName));
          }
        }
        else {
          errorMsg.innerHTML = Msgs.invalidPageName;
        }
      },
      enterConfirms: true
    });
    dialog._element.addEventListener('shown.bs.modal', () => {
      nameInput.focus();
    })
  }
}


async function populateDashTitle(title) {

  let titleContainer = document.getElementById(dashTitleContainerId);
  let titleElem = document.getElementById(dashTitleId);
  let titleEditBtn = document.getElementById(dashTitleEditId);

  titleElem.textContent = title;

  titleContainer.addEventListener("mouseenter", e => {
    titleEditBtn.classList.remove("invisible");
  });
  titleContainer.addEventListener("mouseleave", e => {
    titleEditBtn.classList.add("invisible");
  });
  titleEditBtn.onclick = () => {
    let nameInput;
    let errorMsg;
    let dialog = createConfirmationDialog({
      title: Msgs.renameBoardModalTitle,
      setBody: body => {
        nameInput = createTextInput(
          body,
          {
            label: Msgs.renameBoardModalInputLabel,
            value: title,
            placeholder: Msgs.renameBoardModalInputPlaceholder,
            style: "float"
          }
        );
        errorMsg = createText(body, "");
      },
      onConfirm: async () => {
        let newTitle = nameInput.value;
        if(!newTitle){
          errorMsg.textContent = Msgs.renameBoardModalNameMissing;
        }
        else{
          let success = await renameBoard(newTitle);
          if(success){
            loadPage(window.location);
          }
          else{
            createNotification( Msgs.notifyError, Msgs.renameBoardFailed);
          }
          dialog.close();
        }
      },
      enterConfirms: true
    });
    dialog._element.addEventListener('shown.bs.modal', () => {
      nameInput.focus();
    })
  }
}

async function populateSidebar(pages, activePage) {

  let sidebarMenu = document.getElementById(sidebarMenuId);

  // page links
  fillSidebarLinks(pages, activePage, sidebarMenu);

  // add page button
  let plusIconHTML = '<img src="/icons/plus-lg.svg" width="16px" height="16px" />'
  let addPageButton = createDomNode(`<button class="btn btn-light btn-sm" id="addPageBtn">${plusIconHTML}</button>`);
  sidebarMenu.appendChild(addPageButton);
  createTooltip(addPageButton, Msgs.addPageBtnTip);
  addPageButton.onclick = () => addPageDialog(pages);

  let sidebarFooter = document.getElementById(sidebarFooterId);
  // spacer div
  sidebarFooter.appendChild(createDomNode(`<div style="height:10vh"></div>`));

  // edit consts
  createButton(
    sidebarFooter,
    Msgs.editConstsBtnLabel,
    showConstEditor,
    {
      tip: Msgs.editConstsBtnTip,
      display: "inline-block"
    }
  )

  // reload board state
  createButton(
    sidebarFooter,
    Msgs.reloadBoardBtnLabel,
    async () => {
      await fancyFetch('/api/board/reset', { method: "post" });
      loadPage();
    },
    {
      tip: Msgs.reloadBoardBtnTip,
      display: "inline-block"
    }
  )
}

function fillSidebarLinks(pages, activePage, containerElem) {

  // add a link to each page
  for (let page of pages) {
    //let linkContent = page == activePage ? `<b>${page.name}</b>` : page.name;
    let listEntry = createDomNode(`<li class="nav-item">
  <a href="${getPageQuery(page.name)}" class="nav-link link-dark align-middle px-0">
    <span class="d-none d-sm-inline">${page.name}</span>
  </a>
</li>`);
    containerElem.appendChild(listEntry);
  }
}

function addPageDialog(pages) {
  let nameInput;
  let errorMsg;
  let dialog = createConfirmationDialog({
    title: Msgs.addPageModalTitle,
    setBody: body => {
      nameInput = createTextInput(
        body,
        {
          label: Msgs.addPageModalInputLabel,
          value: "",
          placeholder: Msgs.addPageModalInputPlaceholder,
          style: "float"
        }
      );
      errorMsg = createText(body, "");
    },
    onConfirm: async () => {
      let pageName = nameInput.value;
      let nameIsAllowed = isAllowedAsPageName(pageName, "", pages);
      if (nameIsAllowed) {
        dialog.close();
        let pageAdded = await AddPage(pageName);
        // for errors: leave this page open, so the error notification is readable
        if (pageAdded) {
          loadPage(window.location.origin + window.location.pathname + getPageQuery(pageName));
        }
      }
      else {
        errorMsg.innerHTML = Msgs.invalidPageName;
      }
    },
    enterConfirms: true
  });

  dialog._element.addEventListener('shown.bs.modal', () => {
    nameInput.focus();
  })
}

// adds a page with the given name
// return true if it worked, false otherwise
async function AddPage(pageName) {
  if (!pageName) {
    createNotification(Msgs.notifyError, Msgs.pageNameMissing);
    return false;
  }

  let encodedName = encodeURIComponent(pageName);
  let { error } = await fancyFetch(
    `/api/board/addpage/${encodedName}`,
    { method: 'post' }
  );
  return (!error);
}

async function renameBoard(newName){
  if(!newName){
    createNotification(Msgs.notifyError, Msgs.boardNameMissing);
    return false;
  }

  let encodedName = encodeURIComponent(newName);
  let {error} = await fancyFetch(
    `/api/board/renameboard/${encodedName}`,
    { method: 'post' }
  );
  return (!error);
}

async function renamePage(oldName, newName) {
  if (!newName) {
    createNotification(Msgs.notifyError, Msgs.pageNameMissing);
    return false;
  }

  let oldEncoded = encodeURIComponent(oldName);
  let newEncoded = encodeURIComponent(newName);

  let { error } = await fancyFetch(
    `/api/board/renamepage/${oldEncoded}/${newEncoded}`,
    { method: 'post' }
  );
  return (!error);
}

function isAllowedAsPageName(newName, oldName, pages) {

  // name didn't change -> pass 
  if (newName == oldName) {
    return true;
  }

  // new name not a valid file name -> fail
  if (!isValidFilename(newName)) {
    return false;
  }

  // new name collides with system folder names
  if( ["_assets", "_clientextensions", "_serverextensions"].includes(newName) ){
    return false;
  }

  // new name already in use -> fail
  // otherwise -> pass
  let collides = pages.some(p => p.name == newName);
  return !collides;
}

function isAllowedAsCellName(newName, oldName, cells) {
  // name didn't change -> pass 
  if (newName == oldName) {
    return true;
  }

  // new name not a valid file name -> fail
  if (!isValidFilename(newName)) {
    return false;
  }

  // new name already in use -> fail
  // otherwise -> pass
  let collides = cells.some(c => c.name == newName);
  return !collides;
}

async function moveCell(pageName, currentCellId, moveToCellId) {
  let { error } = await fancyFetch(
    `/api/board/movecell/${encodeURIComponent(pageName)}/${currentCellId}/${moveToCellId}`,
    {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: ""
    }
  );
  // for errors: this page open, so the error notification is readable
  if (!error) {
    loadPage();
  }
}

async function showConstEditor() {

  let editor;
  let dialog = createConfirmationDialog({

    title: Msgs.constsEditorTitle,
    widthClass: "modal-fullscreen",
    confirmLabel: Msgs.constsEditorConfirmLabel,
    setBody: async(body) => {
      // load editor
      await requireScript("vendor/ace/src-noconflict/ace.js");
      let { text: helpContent } = await fancyFetch('./constEditorHelp.html', {}, FetchType.text);
      createDiv( body, helpContent + `<h6>${Msgs.constsEditorHeader}</h6>`);
      let editorDiv = createDomNode(`<div class="col border" style="height: 80vh; font-size: 14px"></div>`)
      body.appendChild(editorDiv);
      editor = ace.edit(editorDiv, {
        mode: "ace/mode/javascript",
        selectionStyle: "json",
        fontSize: "12pt"
      });

      editor.session.setUseWrapMode(true);
      editor.setShowPrintMargin(false);
      editor.setValue(JSON.stringify(window.userConsts, null, '\t'), 1);  // cursor pos at start
    },
    onConfirm: async () => {
      let newUserConstsStr = editor.getValue();
      try {
        JSON.parse(newUserConstsStr);
      } catch (err) {
        alert(Msgs.constsEditorParseError)
        return;
      }
      dialog.close();
      let { error } = await fancyFetch(
        `/api/board/userconsts`,
        {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: newUserConstsStr
        }
      );
      // for errors: leave this page open, so the error notification is readable
      if (!error) {
        loadPage();
      }
    }
  });
}
async function setupCellEditor(pageName, cellId, cellURL) {

  let { text: code } = await fancyFetch(cellURL, {}, FetchType.text);
  let { text: helpContent } = await fancyFetch('./moduleEditorHelp.html', {}, FetchType.text);


  let editor;
  let dialog = createConfirmationDialog({

    title: Msgs.cellEditorTitle,
    widthClass: "modal-fullscreen",
    confirmLabel: Msgs.cellEditorConfirmLabel,
    keyboard: false,  // prevent closing with ESC
    setBody: async (body) => {
      await requireScript("vendor/ace/src-noconflict/ace.js");
      const AceContainerId = "acecontainer";
      body.appendChild(createDomNode(`
      <div class="row" style="height:78vh">
        <div id="${AceContainerId}" class="col-6 border h-100"></div>
        <div class="col-6 h-100 ps-3">${helpContent}</div>
      </div>`));

      //inject consts into helpContent
      let constsCodeElem = document.getElementById("helpContentConstsProps");
      constsCodeElem.innerHTML = JSON.stringify(window.consts, null, '  ');

      editor = ace.edit(AceContainerId, {
        mode: "ace/mode/javascript",
        selectionStyle: "text",
        fontSize: "12pt",
        useWorker: false  // syntax checker falsely warns about async
      });

      editor.session.setUseWrapMode(true);
      editor.setShowPrintMargin(false);
      editor.setValue(code, 1); // cursor pos at start
    },
    onConfirm: async () => {
      dialog.close();
      let { error } = await fancyFetch(
        `/api/board/updatecellcontent/${encodeURIComponent(pageName)}/${cellId}`,
        {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ content: editor.getValue() })
        }
      );
      // for errors: leave this page open, so the error notification is readable
      if (!error) {
        loadPage();
      }
    }
  });
}

async function removeCell(pageName, cellId) {
  let { error } = await fancyFetch(
    `/api/board/removecell/${encodeURIComponent(pageName)}/${cellId}`,
    { method: "post" }
  );
  // for errors: leave this page open, so the error notification is readable
  if (!error) {
    loadPage();
  }
}

function getPageQuery(pageName) {
  return `?page=${encodeURIComponent(pageName)}`;
}

function cellURL(pageName, cellName) {
  return `/pages/${encodeURIComponent(pageName)}/${encodeURIComponent(cellName)}.js`;
}

// what kind of result data do we expect from a fetch request
const FetchType = { text: "text", json: "json", nil: "nil" };

// runs fetch with url and (regular fetch) options
// shows notifications when errors occur
// returns an object with properties:
// json or text, depending on fetchtype
// error, if any occurred
async function fancyFetch(url, options, fetchtype = FetchType.nil) {

  let response;
  try {
    response = await fetch(url, options);
  }
  catch (err) {
    createNotification(Msgs.notifyError, Msgs.fetchError + err);
    return { error: err };
  }

  if (!response.ok) {
    let msg = Msgs.httpError + " " + response.status + " (" + response.statusText + ") " + await response.text();
    createNotification(Msgs.notifyError, msg);
    return { error: msg };
  }

  switch (fetchtype) {
    case FetchType.text: {
      return { text: await response.text() };
    }
    case FetchType.json: {
      try {
        return { json: await response.json() }
      }
      catch (err) {
        createNotification(Msgs.notifyError, Msgs.jsonParseError + err);
        return { error: err }
      }
    }
    case FetchType.nil:
    default:
      return {}
  }
}

function loadPage(url) {
  setTimeout(function () {
    if (!url) {
      window.location.reload();
    }
    else {
      window.location.href = url;
    }
  },
    400
  );
}