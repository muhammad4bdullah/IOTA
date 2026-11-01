(()=>{
  const loginPanel=document.querySelector("#login-panel");
  const dashboard=document.querySelector("#dashboard-shell");
  if(!loginPanel||!dashboard)return;

  const loginForm=document.querySelector("#admin-login");
  const form=document.querySelector("#admin-form");
  const rows=document.querySelector("#admin-game-rows");
  const search=document.querySelector("#admin-search");
  const message=form.querySelector(".form-message");
  const logoutButton=document.querySelector("#admin-logout");
  const escape=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  let catalog=[];
  let saveInProgress=false;

  async function api(url,options={}){
    const response=await fetch(url,{credentials:"same-origin",...options,headers:{"accept":"application/json",...(options.body?{"content-type":"application/json"}:{}),...options.headers}});
    if(!response.ok){
      let detail=`Request failed (${response.status}).`;
      try{detail=(await response.json()).error||detail}catch{}
      const error=new Error(detail);
      error.status=response.status;
      throw error;
    }
    if(response.status===204)return null;
    return response.json();
  }

  function showLogin(messageText=""){
    dashboard.hidden=true;
    loginPanel.hidden=false;
    logoutButton.hidden=true;
    loginForm.querySelector(".form-message").textContent=messageText;
  }

  function showDashboard(){
    loginPanel.hidden=true;
    dashboard.hidden=false;
    logoutButton.hidden=false;
    if(window.lucide)window.lucide.createIcons();
  }

  function render(){
    const query=search.value.trim().toLowerCase();
    const filtered=catalog.filter(game=>game.title.toLowerCase().includes(query)||game.developer.toLowerCase().includes(query));
    rows.innerHTML=filtered.length?filtered.map(game=>`<tr>
      <td>${escape(game.title)}<small>${escape(game.developer)}${game.hasFile?" · Download link ready":" · No file link"}</small></td>
      <td><span class="status ${game.published?"":"unpublished"}">${game.published?"Published":"Unpublished"}</span></td>
      <td>${game.downloadCount}</td>

      <td><div class="table-actions">
        <button type="button" data-edit="${escape(game.id)}">Edit</button>
        <button type="button" data-toggle="${escape(game.id)}">${game.published?"Unpublish":"Publish"}</button>
        <button type="button" data-delete="${escape(game.id)}">Remove</button>
      </div></td>
    </tr>`).join(""):'<tr><td colspan="4" class="muted">No games yet. Add a listing to get started.</td></tr>';
    document.querySelector("#stat-games").textContent=String(catalog.length);
    document.querySelector("#stat-published").textContent=String(catalog.filter(game=>game.published).length);
    document.querySelector("#stat-downloads").textContent=String(catalog.reduce((sum,game)=>sum+game.downloadCount,0));
    if(window.lucide)window.lucide.createIcons();
  }

  async function loadCatalog(){
    const result=await api("/api/admin/games");
    catalog=result.games;
    render();
  }

  function resetForm(){
    form.reset();
    form.elements.id.value="";
    form.elements.version.value="1.0.0";
    message.textContent="";
    document.querySelector("#form-heading").textContent="Add a game";
  }

  function editGame(game){
    form.elements.id.value=game.id;
    form.elements.title.value=game.title;
    form.elements.developer.value=game.developer;
    form.elements.genre.value=game.genre.join(", ");
    form.elements.platforms.value=game.platforms.join(", ");

    form.elements.version.value=game.version;
    form.elements.description.value=game.description;
    form.elements.coverImage.value=game.coverImage||"";
    form.elements.fileUrl.value=game.fileUrl||"";
    form.elements.license.value=game.license||"";
    form.elements.rightsConfirmed.checked=Boolean(game.rightsConfirmed);
    form.elements.published.checked=game.published;
    document.querySelector("#form-heading").textContent=`Edit ${game.title}`;
    document.querySelector("#game-form").scrollIntoView({behavior:"smooth"});
    message.textContent=game.hasFile?"A download link is configured.":"No download link is configured.";
  }

  loginForm.addEventListener("submit",async event=>{
    event.preventDefault();
    const status=loginForm.querySelector(".form-message");
    status.textContent="Signing in…";
    try{
      await api("/api/admin/login",{method:"POST",body:JSON.stringify({password:loginForm.elements.password.value})});
      loginForm.reset();
      showDashboard();
      await loadCatalog();
    }catch(error){
      status.textContent=error.message;
    }
  });

  logoutButton.addEventListener("click",async()=>{
    try{await api("/api/admin/logout",{method:"POST"});showLogin("You have signed out.")}
    catch(error){window.alert(error.message)}
  });

  document.querySelector("#new-game").addEventListener("click",()=>{
    resetForm();
    document.querySelector("#game-form").scrollIntoView({behavior:"smooth"});
  });
  document.querySelector("#cancel-edit").addEventListener("click",resetForm);
  search.addEventListener("input",render);

  rows.addEventListener("click",async event=>{
    const button=event.target.closest("button");
    if(!button)return;
    const game=catalog.find(item=>item.id===(button.dataset.edit||button.dataset.toggle||button.dataset.delete));
    if(!game)return;
    if(button.dataset.edit){editGame(game);return}
    if(button.dataset.toggle){
      try{
        await api("/api/admin/games",{method:"POST",body:JSON.stringify({
          ...game,
          published:!game.published,
          license:game.license,
          rightsConfirmed:Boolean(game.rightsConfirmed)
        })});
        await loadCatalog();
      }catch(error){window.alert(error.message)}
      return;
    }
    if(button.dataset.delete&&window.confirm(`Permanently remove ${game.title} and its download link from IOTA?`)){
      try{
        await api(`/api/admin/games/${encodeURIComponent(game.id)}`,{method:"DELETE"});
        await loadCatalog();
      }catch(error){window.alert(error.message)}
    }
  });

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(saveInProgress||!form.reportValidity())return;
    saveInProgress=true;
    const submit=form.querySelector('button[type="submit"]');
    submit.disabled=true;
    message.textContent="Saving listing…";
    const title=form.elements.title.value.trim();
    const id=form.elements.id.value||title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    const old=catalog.find(game=>game.id===id);
    const game={
      id,
      title,
      developer:form.elements.developer.value.trim(),
      genre:form.elements.genre.value.split(",").map(value=>value.trim()).filter(Boolean),
      platforms:form.elements.platforms.value.split(",").map(value=>value.trim()).filter(Boolean),

      version:form.elements.version.value.trim(),
      description:form.elements.description.value.trim(),
      coverImage:form.elements.coverImage.value.trim(),
      fileUrl:form.elements.fileUrl.value.trim(),
      price:0,
      published:form.elements.published.checked,
      license:form.elements.license.value.trim(),
      rightsConfirmed:form.elements.rightsConfirmed.checked
    };
    try{
      await api("/api/admin/games",{method:"POST",body:JSON.stringify(game)});
      await loadCatalog();
      resetForm();
      message.textContent=game.fileUrl?"Game and download link saved.":"Game saved. Add a download link to enable downloads.";
      if(old&&old.hasFile&&!game.fileUrl)message.textContent="Game saved, but downloads remain unavailable until you add a download link.";
    }catch(error){
      message.textContent=error.message;
    }finally{
      saveInProgress=false;
      submit.disabled=false;
    }
  });

  (async()=>{
    try{
      const session=await api("/api/admin/session");
      if(!session.authenticated){showLogin();return}
      showDashboard();
      await loadCatalog();
    }catch(error){
      if(error.status===401)showLogin();
      else showLogin(`Dashboard could not connect: ${error.message}`);
    }
  })();
})();
