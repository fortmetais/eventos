import { randomUUID } from 'node:crypto';

export const demoOrganizationId = '00000000-0000-4000-8000-000000000901';
export const demoUserId = '00000000-0000-4000-8000-000000000902';
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const statuses = ['RECEIVED', 'REVIEW', 'APPROVED', 'CONFIRMED', 'WAITLIST', 'REJECTED', 'CANCELLED'];
const defaultTemplate = `Olá, {{primeiro_nome}}! Sua candidatura para servir no {{evento}} foi aceita!\n\n{{organizacao}} · Evento a partir de {{data_evento}}.\n\nDepartamento alocado: {{departamento}}.\n\nConfirme sua presença pelo link: {{link}}\n\nEsperamos você!`;
const fields = [
  ['nome', 'Nome do candidato', 'Maria Exemplo'], ['primeiro_nome', 'Primeiro nome do candidato', 'Maria'],
  ['evento', 'Nome do evento', 'Acampamento de demonstração'], ['organizacao', 'Organização', 'Comunidade de demonstração'],
  ['data_evento', 'Data do evento', '05/02/2027'], ['departamento', 'Departamento alocado', 'SECRETARIA'],
  ['link', 'Link pessoal', '[link fictício de confirmação]'], ['validade', 'Validade do link', '[data de vencimento]'],
].map(([key, label, example]) => ({key, label, example}));
export function createDemoState() {
  const organization = { id: demoOrganizationId, name: 'Comunidade de demonstração', kind: 'PARISH', city: 'Loanda', state: 'PR', active: true, contact: 'contato@demonstracao.invalid', cnpj: '00000000000000', legalName: 'Comunidade fictícia para revisão visual', tradeName: 'Encontro local', postalCode: '87900000', street: 'Rua de demonstração', number: '100', neighborhood: 'Centro', complement: '' };
  const user = {id:demoUserId, email:'organizador@demonstracao.invalid', aud:'authenticated', role:'authenticated', app_metadata:{}, user_metadata:{}, email_confirmed_at: new Date().toISOString()};
  const profile = {name:'Maria de Demonstração', phone:'44999998888', birthDate:'1991-08-21', city:'Comunidade rural (cadastro anterior)'};
  const events = [
    {id:uuid(911), name:'Acampamento de demonstração', startsAt:'2027-02-05T12:00:00.000Z', endsAt:'2027-02-09T12:00:00.000Z', status:'PUBLISHED', slug:'acampamento-demo'},
    {id:uuid(912), name:'Encontro anterior de demonstração', startsAt:'2026-10-10T12:00:00.000Z', endsAt:'2026-10-12T12:00:00.000Z', status:'COMPLETED', slug:'encontro-anterior-demo'},
  ].map((event, i) => ({...event, organizationId:demoOrganizationId, organization, type:{id:uuid(950),name:'FAC'}, typeName:'FAC', description:'Evento fictício para explorar os campos e a navegação da aplicação. Nenhum dado será enviado aos serviços reais.', location:'Espaço de demonstração', city:'Loanda', departmentsReady:true, imageUrl:'/__demo/banner.svg', mobileImageUrl:'/__demo/banner.svg', thumbnailUrl:'/__demo/banner.svg', hasRegistrations:true, teams:[{id:uuid(920+i*2),eventId:event.id,name:'SECRETARIA',capacity:12,occupied:7,available:5},{id:uuid(921+i*2),eventId:event.id,name:'ACOLHIDA',capacity:20,occupied:10,available:10}], campaigns:[{id:uuid(930+i*2),eventId:event.id,kind:'VOLUNTEER',opensAt:'2026-01-01T12:00:00.000Z',closesAt:'2027-01-31T12:00:00.000Z',allowWaitlist:true,capacity:null,paused:false,_count:{registrations:30}},{id:uuid(931+i*2),eventId:event.id,kind:'CAMPER',opensAt:'2026-01-01T12:00:00.000Z',closesAt:'2027-01-31T12:00:00.000Z',allowWaitlist:true,capacity:100,paused:false,_count:{registrations:15}}]}));
  return {organization,user,profile,events,templates:new Map(),functions:[{id:uuid(940),organizationId:demoOrganizationId,name:'Organizador',description:'Gerencia a organização e os eventos.',role:'ORGANIZER',active:true},{id:uuid(941),organizationId:demoOrganizationId,name:'Secretaria',description:'Acompanha as inscrições.',role:'SECRETARY',active:true}],photo:false};
}
const page = (items, query) => {const page = Math.max(1, Number(query.get('page') || 1)), pageSize=Math.max(1,Number(query.get('pageSize')||20)); return {items:items.slice((page-1)*pageSize,page*pageSize),total:items.length,page,pageSize,totalPages:Math.max(1,Math.ceil(items.length/pageSize))};};
const member = (state) => ({id:uuid(903),accountId:demoUserId,organizationId:demoOrganizationId,organization:state.organization,role:'ORGANIZER',active:true,healthEventIds:[],account:{id:demoUserId,email:state.user.email,profile:state.profile}});
function summary(event) {
  const campaigns = event.campaigns.map((c,i) => {const amounts=i?[4,2,3,4,0,1,1]:[6,2,8,9,1,3,1];return {id:c.id,kind:c.kind,total:amounts.reduce((a,b)=>a+b,0),byStatus:Object.fromEntries(statuses.map((s,n)=>[s,amounts[n]])),candidateGoing:i?3:7};});
  return {eventId:event.id,generatedAt:new Date().toISOString(),presenceAvailable:true,departmentsAvailable:true,totals:{total:campaigns.reduce((n,c)=>n+c.total,0),byStatus:Object.fromEntries(statuses.map(s=>[s,campaigns.reduce((n,c)=>n+c.byStatus[s],0)])),candidateGoing:campaigns.reduce((n,c)=>n+c.candidateGoing,0)},campaigns,departments:event.teams.map(t=>({...t,occupiedByCampaign:{[event.campaigns[0].id]:Math.max(0,t.occupied-2),[event.campaigns[1].id]:2}}))};
}
function messageSettings(state,event) {const saved=state.templates.get(event.id);return {ready:true,event:{id:event.id,name:event.name},revision:saved?.revision??0,template:saved?.template??defaultTemplate,customized:Boolean(saved?.template),defaultTemplate,fields,requiredFields:[{keys:['nome','primeiro_nome'],label:'Nome do candidato'},{keys:['link'],label:'Link pessoal'}],previewValues:{...Object.fromEntries(fields.map(f=>[f.key,f.example])),evento:event.name,organizacao:state.organization.name,link:'/r#demonstracao-sem-acesso-real'}};}
export function handleDemoApi(state, method, url, body = {}) {
  const path=url.pathname.replace(/^\/api\/v1/,'');
  if(path==='/config')return {supabaseUrl:'https://auth.ui-demo.invalid',supabaseAnonKey:'sb_publishable_demo_local',eventsEnabled:true,eventManagementEnabled:true,volunteerRegistrationsEnabled:true,volunteerRegistrationsReady:true,camperRegistrationsEnabled:false,camperRegistrationsReady:false,registrationPrefillEnabled:true};
  if(path==='/me/access')return {account:{id:demoUserId,email:state.user.email,profile:state.profile,platformAdmin:false},organizations:[member(state)]};
  if(path==='/me/profile'){if(method==='PUT')Object.assign(state.profile,body);return {id:demoUserId,email:state.user.email,profile:state.profile};}
  if(path==='/me/registrations')return [];
  if(path==='/me/photo'||path.startsWith('/me/photos')){if(method==='POST'){state.photo=true;state.profile.photoAssetId=uuid(960);}return {id:uuid(960),assetId:uuid(960),photoAssetId:uuid(960),url:'/__demo/avatar.svg'};}
  if(path==='/public/parishes')return [{id:state.organization.id,name:state.organization.name,city:'Loanda',state:'PR'}];
  if(path==='/public/events')return page(state.events,url.searchParams);
  if(path.startsWith('/public/events/'))return state.events.find(e=>[e.id,e.slug].includes(path.split('/')[3]))??state.events[0];
  if(path==='/admin/organizations')return page([state.organization],url.searchParams);
  const orgBase=`/organizations/${demoOrganizationId}`;
  if(path===orgBase){if(['PUT','PATCH'].includes(method))Object.assign(state.organization,body);return state.organization;}
  if(path===`${orgBase}/members`)return {members:[member(state)],invitations:[],functions:state.functions};
  if(path===`${orgBase}/events`||path===`${orgBase}/event-setups`){if(method==='POST'){const input=body.event??body;state.events.push({...state.events[0],...input,id:randomUUID(),campaigns:body.campaigns??[],teams:(body.departments??[]).map(d=>({...d,id:randomUUID(),occupied:0,available:d.capacity??null})),status:'DRAFT',hasRegistrations:false});}return state.events;}
  if(path===`${orgBase}/functions`){if(method==='POST'){const item={...body,id:randomUUID(),organizationId:demoOrganizationId};state.functions.push(item);return item;}return state.functions;}
  if(path.startsWith(`${orgBase}/functions/`)){const item=state.functions.find(f=>f.id===path.split('/').at(-1));if(item)Object.assign(item,body);return item??{};}
  const event = state.events.find(e=>path.includes(e.id));
  if(event&&/\/(volunteer|camper)-form$/.test(path)&&method==='GET'){
    const kind=path.endsWith('/camper-form')?'CAMPER':'VOLUNTEER';
    return {event:{id:event.id,name:event.name,status:event.status},campaign:event.campaigns.find(c=>c.kind===kind),departmentsReady:true,departments:event.teams,form:null,template:{askCpf:false,askAddress:false,askShirt:true,questions:[],terms:'Termos fictícios para revisão local da interface. Nenhum aceite real é coletado nesta demonstração.',volunteer:{template:'VOLUNTEER_INTENTION_V1',description:'Ficha fictícia para explorar os campos.',requirements:'Orientações de demonstração.',training:'Preparação de demonstração.'},camper:{template:'CAMPER_REGISTRATION_V1',description:'Ficha fictícia para explorar os campos.',requirements:'Orientações de demonstração.',arrivalInstructions:'Preparação de demonstração.'}}};
  }
  if(event&&path.endsWith('/registration-summary'))return summary(event);
  if(event&&path.endsWith('/accept-message')){if(method==='PUT'){const prior=state.templates.get(event.id);if((prior?.revision??0)!==body.revision)return {__status:409,message:'O modelo foi alterado. Recarregue para continuar.'};state.templates.set(event.id,{revision:(prior?.revision??0)+1,template:body.template});}return messageSettings(state,event);}
  if(event&&((path.includes('/event-setups/')&&method==='PUT')||(path===orgBase+'/events/'+event.id&&method==='PUT'))){Object.assign(event,body.event??body);return event;}
  if(event&&path.endsWith('/status')&&method==='PATCH'){event.status=body.status;return event;}
  if(event&&path.endsWith('/campaigns')&&method==='PUT'){let campaign=event.campaigns.find(c=>c.kind===body.kind);if(campaign)Object.assign(campaign,body);else{campaign={...body,id:randomUUID(),eventId:event.id};event.campaigns.push(campaign);}return campaign;}
  if(event&&(/\/teams$|\/departments$/.test(path)))return event.teams;
  if(path===orgBase+'/participant-imports')return {ready:true,eventReady:true,prefillEnabled:false,destinations:[],batches:[]};
  if(path===orgBase+'/previous-participants')return page([],url.searchParams);
  if(event&&path.endsWith('/health'))return [];
  if(path.endsWith('/registrations'))return page([],url.searchParams);
  if(path.includes('/participant-imports')||path.includes('/event-imports')||path.includes('/imports'))return {items:[],total:0,page:1,pageSize:20,totalPages:1,ready:true};
  if(path.endsWith('/health/events'))return [];
  if(method==='GET')return [];
  return {__status:422,message:'Esta ação não faz parte da demonstração. Nenhum dado real foi alterado.'};
}
