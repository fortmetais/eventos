// Local, in-memory UI demonstration. No production APIs, database or messages.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemoState, handleDemoApi, demoOrganizationId } from './fixtures-ui-ux-preview.mjs';

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(workspace, process.env.UI_UX_DEMO_DIST || 'apps/web/dist');
const audit = resolve(workspace, process.env.UI_UX_DEMO_REPORT || '.local/ui-ux-audit');
const port = Number(process.env.UI_UX_DEMO_PORT || 5196);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use uma porta local válida.');
let state = createDemoState();
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'};
const policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const html = (title, content) => `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/__demo/launcher.css"><main>${content}</main></html>`;
const launcher = html('Demonstração local da interface', `<p class="tag">Demonstração local · dados fictícios</p><h1>Explore a aplicação</h1><p>Confira as telas no computador e no celular. As alterações desta demonstração ficam apenas na memória deste processo e desaparecem ao reiniciar. Nenhuma conta, banco ou mensagem real será utilizado.</p><nav><a href="/meu-perfil">Meu perfil</a><a href="/organizacao/${demoOrganizationId}">Minha organização</a><a href="/organizacao/${demoOrganizationId}/eventos">Eventos</a><a href="/organizacao/${demoOrganizationId}/mensagens?evento=00000000-0000-4000-8000-000000000911">Mensagens do evento</a><a href="/eventos">Explorar eventos</a><a href="/__audit/">Relatório de revisão</a></nav><h2>O que experimentar</h2><ul><li>Edite o perfil, telefone e cidade; cancele ou tente navegar antes de salvar.</li><li>Altere os dados da organização e abra a edição de um evento.</li><li>Personalize uma mensagem, troque de evento e confira a proteção do rascunho.</li><li>Reduza a janela para testar o menu e os controles no celular.</li></ul><p class="note">As listas de candidaturas estão vazias nesta demonstração. Fotos enviadas são substituídas por uma imagem ilustrativa. Ações de mensagem externa são bloqueadas.</p><form action="/__demo/reset" method="post"><button>Reiniciar os dados fictícios</button></form>`);
function bootstrap() {
  const now = Math.floor(Date.now()/1000);
  const payload = Buffer.from(JSON.stringify({sub:state.user.id,aud:'authenticated',exp:now+604800,iat:now})).toString('base64url');
  const session = {access_token:`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.demo-local-only`,refresh_token:'demo-local-only',token_type:'bearer',expires_in:604800,expires_at:now+604800,user:state.user};
  return `(() => {
    if (!['127.0.0.1','localhost'].includes(location.hostname)) throw new Error('Demonstração somente local.');
    localStorage.setItem('sb-auth-auth-token', ${JSON.stringify(JSON.stringify(session))});
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, location.href);
      if (url.hostname === 'auth.ui-demo.invalid') return originalFetch('/__demo/auth' + url.pathname + url.search, {method:options?.method || (input instanceof Request ? input.method : 'GET'),headers:{'content-type':'application/json'},body:options?.body});
      if (url.pathname.startsWith('/api/v1/')) return originalFetch(url.pathname + url.search, options);
      if (url.origin !== location.origin) return Promise.resolve(new Response(JSON.stringify({message:'Conexão externa bloqueada na demonstração.'}),{status:503,headers:{'content-type':'application/json'}}));
      return originalFetch(input, options);
    };
    window.open = (url) => { if (!url || new URL(String(url), location.href).origin !== location.origin) { alert('Demonstração: nenhum WhatsApp, e-mail ou site externo foi aberto.'); return null; } location.assign(String(url)); return null; };
    document.addEventListener('click', event => {const anchor=event.target.closest?.('a[href]');if(anchor && new URL(anchor.href,location.href).origin!==location.origin){event.preventDefault();event.stopImmediatePropagation();alert('Demonstração: links e mensagens externas estão bloqueados.');}},true);
    navigator.sendBeacon = () => false;
    window.WebSocket = class {constructor(){throw new Error('Conexão externa desativada na demonstração.');}};
    const ready=()=>{const box=document.createElement('div');box.id='ui-demo-banner';box.innerHTML='<strong>Demonstração local · dados fictícios</strong> <a href="/__demo/">Início da demonstração</a> <a href="/__audit/">Relatório</a>';const style=document.createElement('style');style.textContent='#ui-demo-banner{display:flex;flex-wrap:wrap;gap:6px 16px;padding:8px 18px;background:#163c36;color:#fff;font:12px/1.5 system-ui;position:relative;z-index:9999}#ui-demo-banner a{color:#fff;text-decoration:underline}';document.head.append(style);document.body.prepend(box);};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
  })();`;
}
function send(res, status, body, type='application/json; charset=utf-8', csp=policy) {res.writeHead(status,{'content-type':type,'cache-control':'no-store','content-security-policy':csp,'x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));}
async function file(res, root, relative, spa=false) {
  const path = resolve(root,relative);
  if(path!==root&&!path.startsWith(root+sep))return send(res,403,'Acesso não permitido.','text/plain');
  try {
    const info=await stat(path);
    if(!info.isFile())throw new Error('not file');
    let body=await readFile(path);
    if(spa&&extname(path)==='.html')body=body.toString().replace(/<html\b[^>]*>/i,'<html lang="pt-BR">').replace(/<head>/i,'<head><script src="/__demo/bootstrap.js"></script>');
    send(res,200,body,types[extname(path)]||'application/octet-stream',root===audit?policy.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"):policy);
  } catch {if(spa&&relative!=='index.html')return file(res,root,'index.html',true);send(res,404,'Arquivo local não encontrado.','text/plain; charset=utf-8');}
}
async function requestBody(req) {
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>12*1024*1024)throw new Error('Arquivo maior que o limite da demonstração.');chunks.push(chunk);}
  const buffer=Buffer.concat(chunks), text=buffer.toString('utf8');
  if(req.headers['content-type']?.includes('application/json'))return text?JSON.parse(text):{};
  if(req.headers['content-type']?.includes('multipart/form-data')){const boundary=req.headers['content-type'].match(/boundary=(?:"([^"]+)"|([^;]+))/);const result={};for(const part of text.split('--'+(boundary?.[1]??boundary?.[2]??''))){const split=part.indexOf('\r\n\r\n'),header=part.slice(0,split),name=header.match(/name="([^"]+)"/);if(split<0||!name||header.includes('filename='))continue;const value=part.slice(split+4).replace(/\r\n$/,'');if(name[1]==='data')return JSON.parse(value);result[name[1]]=value;}return result;}
  return {};
}
const server=createServer(async(req,res)=>{
  try{
    const host=new URL('http://'+req.headers.host);
    if(!['127.0.0.1','localhost'].includes(host.hostname))return send(res,403,'Demonstração somente local.','text/plain');
    const url=new URL(req.url,'http://127.0.0.1:'+port),path=url.pathname;
    if(path==='/__demo'||path==='/__demo/')return send(res,200,launcher,'text/html; charset=utf-8');
    if(path==='/__demo/bootstrap.js')return send(res,200,bootstrap(),'text/javascript; charset=utf-8');
    if(path==='/__demo/launcher.css')return send(res,200,'*{box-sizing:border-box}body{margin:0;background:#f6f7fc;color:#17273b;font:16px/1.6 system-ui}main{max-width:900px;margin:48px auto;padding:24px}h1{font-size:36px;line-height:1.2}.tag{color:#196c55;font-weight:700}nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:30px 0}a,button{padding:14px 18px;border:1px solid #d7d9e6;border-radius:10px;color:#5746ba;background:white;font-weight:600;text-decoration:none;font:inherit;cursor:pointer}.note{font-size:14px;color:#536174}button{background:#5746ba;color:white}li{margin:10px 0}','text/css');
    if(path==='/__demo/reset'&&req.method==='POST'){state=createDemoState();res.writeHead(303,{location:'/__demo/'});return res.end();}
    if(path.startsWith('/__demo/auth/')){if(req.method==='OPTIONS')return send(res,204,'');if(path.includes('/token')){const now=Math.floor(Date.now()/1000);return send(res,200,{access_token: 'demo-local-only',refresh_token:'demo-local-only',expires_in:604800,expires_at:now+604800,token_type:'bearer',user:state.user});}return send(res,200,req.method==='GET'?state.user:{});}
    if(path==='/__demo/banner.svg')return send(res,200,'<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="450" viewBox="0 0 1440 450"><defs><linearGradient id="g"><stop stop-color="#284f9b"/><stop offset="1" stop-color="#6738aa"/></linearGradient></defs><rect width="1440" height="450" fill="url(#g)"/><circle cx="1260" cy="50" r="300" fill="#fff" opacity=".06"/><text x="80" y="190" font-family="sans-serif" font-size="56" font-weight="bold" fill="white">Acampamento de demonstração</text><text x="80" y="270" font-family="sans-serif" font-size="32" fill="#e7e1ff">Uma comunidade, novos encontros.</text><text x="80" y="360" font-family="sans-serif" font-size="24" fill="white">IMAGEM FICTÍCIA · REVISÃO LOCAL DA INTERFACE</text></svg>','image/svg+xml');
    if(path==='/__demo/avatar.svg')return send(res,200,'<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="500" height="500" rx="30" fill="#ece8fb"/><circle cx="250" cy="180" r="80" fill="#8875bc"/><path d="M80 460a170 170 0 01340 0" fill="#8875bc"/><text x="250" y="478" text-anchor="middle" font-size="16" font-family="sans-serif" fill="white">FOTO ILUSTRATIVA</text></svg>','image/svg+xml');
    if(path.startsWith('/api/v1/')){const result=handleDemoApi(state,req.method??'GET',url,await requestBody(req));if(result?.__status){const{__status,...body}=result;return send(res,__status,{error:body});}return send(res,200,result);}
    if(path==='/__audit'||path==='/__audit/')return file(res,audit,'index.html');
    if(path.startsWith('/__audit/'))return file(res,audit,decodeURIComponent(path.slice('/__audit/'.length)));
    return file(res,dist,decodeURIComponent(path.slice(1)||'index.html'),true);
  }catch(error){console.error('Demonstração local:',error.message);send(res,500,{message:'Não foi possível concluir esta ação na demonstração local.'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Demonstração local: http://127.0.0.1:${port}/__demo/\nAplicação: ${dist}\nRelatório: http://127.0.0.1:${port}/__audit/\nDados fictícios em memória. Nenhum serviço de produção é utilizado.`));
