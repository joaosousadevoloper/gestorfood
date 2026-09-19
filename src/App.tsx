import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configured, supabase } from './lib/supabase'
import Admin from "./pages/admin";

type Page = 'overview' | 'orders' | 'menu' | 'cash' | 'customers'
type Store = { id: string; name: string; slug: string }
type Order = { id: string; order_number: number; status: string; type: string; total: number; created_at: string; customers: { name: string } | null }
type MenuItem = { id: string; name: string; description: string | null; price: number; active: boolean }
type CashMovement = { id: string; type: string; amount: number; description: string | null; created_at: string }
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const nav: Array<[Page, string, string]> = [['overview','⌂','Visão geral'],['orders','⊞','Pedidos'],['menu','▤','Cardápio'],['cash','R$','Caixa'],['customers','☺','Clientes']]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [store, setStore] = useState<Store | null>(null)
  const [page, setPage] = useState<Page>('overview')
  const [orders, setOrders] = useState<Order[]>([])
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [cash, setCash] = useState<CashMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [modal, setModal] = useState<'order'|'cash'|'menu'|null>(null)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => { if (session) void loadStore(); else { setStore(null); setOrders([]) } }, [session])
  useEffect(() => { if (store) void loadData() }, [store])

  async function loadStore() {
    if (!supabase) return
    const { data, error } = await supabase.from('memberships').select('establishments(id,name,slug)').limit(1).maybeSingle()
    if (error) return tell(error.message)
    const value = data?.establishments
    const first = Array.isArray(value) ? value[0] : value
    setStore((first ?? null) as unknown as Store | null)
  }
  async function loadData() {
    if (!supabase || !store) return
    const [o, m, c] = await Promise.all([
      supabase.from('orders').select('id,order_number,status,type,total,created_at,customers(name)').eq('establishment_id',store.id).order('created_at',{ascending:false}).limit(30),
      supabase.from('menu_items').select('id,name,description,price,active').eq('establishment_id',store.id).order('name'),
      supabase.from('cash_movements').select('id,type,amount,description,created_at').eq('establishment_id',store.id).order('created_at',{ascending:false}).limit(20)
    ])
    if (o.error || m.error || c.error) tell(o.error?.message || m.error?.message || c.error?.message || 'Não foi possível carregar os dados.')
    const normalizedOrders = (o.data ?? []).map((row) => ({ ...row, customers: Array.isArray(row.customers) ? row.customers[0] ?? null : row.customers }))
    setOrders(normalizedOrders as unknown as Order[]); setMenu((m.data ?? []) as MenuItem[]); setCash((c.data ?? []) as CashMovement[])
  }
  function tell(text: string) { setMessage(text); window.setTimeout(() => setMessage(''), 3600) }
  const todayRevenue = useMemo(() => orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString() && o.status !== 'cancelled').reduce((sum,o) => sum + Number(o.total), 0), [orders])
  const cashBalance = useMemo(() => cash.reduce((sum,m) => sum + Number(m.amount),0),[cash])

  if (!configured) return <SetupNotice />
  if (loading) return <div className="center">Carregando Giro Pizza…</div>
  if (!session) return <Auth onMessage={tell} />
  if (window.location.pathname === "/admin") {
  return <Admin />;
}
  if (!store) return <CreateStore onCreated={loadStore} onMessage={tell} />

  return <div className="app-shell"><aside><div className="brand"><b>G</b> giro<span>pizza</span></div><p className="store-name">{store.name}</p><nav>{nav.map(([key,icon,label]) => <button key={key} onClick={() => setPage(key)} className={page===key?'active':''}><i>{icon}</i>{label}</button>)}</nav><div className="online"><span /> Loja aberta<br/><small>{session.user.email}</small></div><button className="logout" onClick={() => supabase?.auth.signOut()}>Sair</button></aside><main><header><div><small>PAINEL OPERACIONAL</small><h1>{nav.find(n=>n[0]===page)?.[2]}</h1></div><button className="primary" onClick={() => setModal(page==='cash'?'cash':page==='menu'?'menu':'order')}>+ {page==='cash'?'Movimentação':page==='menu'?'Novo item':'Novo pedido'}</button></header>{page==='overview'&&<Overview revenue={todayRevenue} orders={orders} cash={cashBalance} onPage={setPage}/>} {page==='orders'&&<Orders orders={orders} onStatus={async (id,status)=>{await supabase!.from('orders').update({status}).eq('id',id); await loadData()}}/>} {page==='menu'&&<Menu items={menu}/>} {page==='cash'&&<Cash rows={cash} balance={cashBalance}/>} {page==='customers'&&<Customers store={store} onMessage={tell}/>}</main>{modal&&<Modal type={modal} store={store} menu={menu} onClose={()=>setModal(null)} onSaved={async()=>{setModal(null);await loadData()}} onMessage={tell}/>}<div className={'toast '+(message?'show':'')}>{message}</div></div>
}

const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)

async function checkPlatformAdmin() {
  if (!supabase) return false

  const { data, error } = await supabase.rpc('is_platform_admin')

  if (error) {
    console.error(error)
    return false
  }

  return data === true
}

function SetupNotice(){return <div className="setup"><h1>Giro Pizza</h1><p>Falta conectar o projeto ao Supabase.</p><ol><li>Copie <code>.env.example</code> para <code>.env.local</code>.</li><li>Preencha a URL e a chave publicável do projeto Supabase.</li><li>Execute <code>supabase/schema.sql</code> no SQL Editor.</li></ol></div>}
function Auth({onMessage}:{onMessage:(s:string)=>void}) { const [mode,setMode]=useState<'login'|'signup'>('login'); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [name,setName]=useState(''); async function submit(e:FormEvent){e.preventDefault(); if(!supabase)return; const r=mode==='login'?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password,options:{data:{full_name:name}}}); if(r.error) onMessage(r.error.message); else onMessage(mode==='login'?'Login realizado.':'Conta criada. Confirme seu e-mail se o projeto exigir confirmação.')}; return <div className="auth"><form onSubmit={submit}><div className="brand"><b>G</b> giro<span>pizza</span></div><h1>{mode==='login'?'Entre na operação':'Crie sua conta'}</h1><p>{mode==='login'?'Acesse o painel da sua loja.':'Comece a configurar a sua loja.'}</p>{mode==='signup'&&<label>Seu nome<input value={name} onChange={e=>setName(e.target.value)} required /></label>}<label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label><label>Senha<input type="password" minLength={6} value={password} onChange={e=>setPassword(e.target.value)} required /></label><button className="primary">{mode==='login'?'Entrar':'Criar conta'}</button><button type="button" className="text-button" onClick={()=>setMode(mode==='login'?'signup':'login')}>{mode==='login'?'Ainda não tenho conta':'Já tenho uma conta'}</button></form></div>}
function CreateStore({onCreated,onMessage}:{onCreated:()=>Promise<void>;onMessage:(s:string)=>void}){const [name,setName]=useState('');const [slug,setSlug]=useState('');async function submit(e:FormEvent){e.preventDefault();const {error}=await supabase!.rpc('create_establishment',{store_name:name,store_slug:slug,store_phone:null});if(error)onMessage(error.message);else await onCreated()}return <div className="auth"><form onSubmit={submit}><div className="brand"><b>G</b> giro<span>pizza</span></div><h1>Crie sua primeira loja</h1><p>Você será o proprietário e poderá adicionar a equipe depois.</p><label>Nome da loja<input value={name} onChange={e=>setName(e.target.value)} placeholder="Pizzaria do João" required /></label><label>Endereço do cardápio<input value={slug} onChange={e=>setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'-'))} placeholder="pizzaria-do-joao" required /></label><button className="primary">Criar loja</button></form></div>}

function Overview({revenue,orders,cash,onPage}:{revenue:number;orders:Order[];cash:number;onPage:(p:Page)=>void}){const preparing=orders.filter(o=>['new','production'].includes(o.status)).length;return <><div className="metrics"><Metric label="Faturamento hoje" value={BRL.format(revenue)} accent="orange"/><Metric label="Pedidos em aberto" value={String(preparing)} accent="purple"/><Metric label="Saldo do caixa" value={BRL.format(cash)} accent="green"/><Metric label="Pedidos no painel" value={String(orders.length)} accent="blue"/></div><div className="two-col"><section className="card"><div className="section-title"><div><h2>Pedidos recentes</h2><p>Acompanhe a operação em tempo real.</p></div><button className="text-button" onClick={()=>onPage('orders')}>Ver pedidos →</button></div>{orders.slice(0,6).map(o=><OrderLine key={o.id} order={o}/>)||<Empty text="Ainda não há pedidos."/>}</section><section className="card"><div className="section-title"><div><h2>Próximos passos</h2><p>O que falta para colocar a loja no ar.</p></div></div><div className="check"><b>1</b><p><strong>Cadastre o cardápio</strong><span>Produtos, adicionais e preços.</span></p></div><div className="check"><b>2</b><p><strong>Abra o caixa</strong><span>Registre o saldo inicial do turno.</span></p></div><div className="check"><b>3</b><p><strong>Convide sua equipe</strong><span>Defina permissões por cargo.</span></p></div></section></div></>}
function Metric({label,value,accent}:{label:string;value:string;accent:string}){return <article className="metric"><span className={'metric-dot '+accent}/><p>{label}</p><strong>{value}</strong><small>Atualizado agora</small></article>}
function Status({value}:{value:string}){const labels:Record<string,string>={new:'Novo',production:'Em produção',ready:'Pronto',delivery:'Em entrega',completed:'Concluído',cancelled:'Cancelado'};return <span className={'status '+value}>{labels[value]??value}</span>}
function OrderLine({order}:{order:Order}){return <div className="order-line"><div className="order-id">#{order.order_number}</div><div><strong>{order.customers?.name ?? 'Cliente sem cadastro'}</strong><small>{order.type==='delivery'?'Entrega':order.type==='pickup'?'Retirada':'Balcão'}</small></div><b>{BRL.format(Number(order.total))}</b><Status value={order.status}/></div>}
function Empty({text}:{text:string}){return <div className="empty-small">{text}</div>}
function Orders({orders,onStatus}:{orders:Order[];onStatus:(id:string,status:string)=>Promise<void>}){return <section className="card"><div className="section-title"><div><h2>Pedidos</h2><p>Atualize o status conforme o pedido avança.</p></div></div>{orders.length?orders.map(o=><div className="order-line full" key={o.id}><div className="order-id">#{o.order_number}</div><div><strong>{o.customers?.name ?? 'Cliente sem cadastro'}</strong><small>{new Date(o.created_at).toLocaleString('pt-BR')} · {o.type}</small></div><b>{BRL.format(Number(o.total))}</b><Status value={o.status}/><select aria-label="Atualizar pedido" value={o.status} onChange={e=>void onStatus(o.id,e.target.value)}><option value="new">Novo</option><option value="production">Em produção</option><option value="ready">Pronto</option><option value="delivery">Em entrega</option><option value="completed">Concluído</option><option value="cancelled">Cancelado</option></select></div>):<Empty text="Crie seu primeiro pedido no botão acima."/>}</section>}
function Menu({items}:{items:MenuItem[]}){return <><div className="public-link"><div><b>Cardápio público</b><span>Quando a página pública estiver publicada, seus clientes comprarão pelo link da loja.</span></div><code>/pedido/sua-loja</code></div><section className="menu-grid">{items.map(i=><article className="menu-card" key={i.id}><div className="food">🍕</div><div><h3>{i.name}</h3><p>{i.description||'Sem descrição.'}</p><b>{BRL.format(Number(i.price))}</b></div><Status value={i.active?'ready':'cancelled'}/></article>)}{!items.length&&<Empty text="Nenhum item cadastrado. Use “Novo item” para criar o cardápio."/>}</section></>}
function Cash({rows,balance}:{rows:CashMovement[];balance:number}){return <><div className="metrics"><Metric label="Saldo de movimentações" value={BRL.format(balance)} accent="green"/><Metric label="Lançamentos" value={String(rows.length)} accent="blue"/></div><section className="card"><div className="section-title"><div><h2>Movimentações</h2><p>Entradas, retiradas, despesas e suprimentos.</p></div></div>{rows.map(r=><div className="cash-line" key={r.id}><div><strong>{r.description||r.type}</strong><small>{new Date(r.created_at).toLocaleString('pt-BR')}</small></div><span className={Number(r.amount)>=0?'positive':'negative'}>{Number(r.amount)>=0?'+ ':''}{BRL.format(Number(r.amount))}</span></div>)}{!rows.length&&<Empty text="Nenhuma movimentação neste caixa."/>}</section></>}
function Customers({store,onMessage}:{store:Store;onMessage:(s:string)=>void}){const [name,setName]=useState('');const [phone,setPhone]=useState('');const [address,setAddress]=useState('');async function submit(e:FormEvent){e.preventDefault();const {error}=await supabase!.from('customers').insert({establishment_id:store.id,name,phone,address});if(error)onMessage(error.message);else{onMessage('Cliente cadastrado com sucesso.');setName('');setPhone('');setAddress('')}}return <section className="card customer-form"><div className="section-title"><div><h2>Cadastro de clientes</h2><p>Guarde endereços e histórico de compra.</p></div></div><form onSubmit={submit}><label>Nome<input value={name} onChange={e=>setName(e.target.value)} required /></label><label>WhatsApp<input value={phone} onChange={e=>setPhone(e.target.value)} /></label><label>Endereço<input value={address} onChange={e=>setAddress(e.target.value)} /></label><button className="primary">Cadastrar cliente</button></form></section>}
function Modal({type,store,menu,onClose,onSaved,onMessage}:{type:'order'|'cash'|'menu';store:Store;menu:MenuItem[];onClose:()=>void;onSaved:()=>Promise<void>;onMessage:(s:string)=>void}){const [name,setName]=useState('');const [amount,setAmount]=useState('');const [kind,setKind]=useState('counter');const [description,setDescription]=useState('');async function submit(e:FormEvent){e.preventDefault();if(!supabase)return;let error;if(type==='menu')({error}=await supabase.from('menu_items').insert({establishment_id:store.id,name,description,price:Number(amount),active:true}));else if(type==='cash'){const sign=kind==='withdrawal'||kind==='expense'?-1:1;({error}=await supabase.from('cash_movements').insert({establishment_id:store.id,type:kind,amount:sign*Math.abs(Number(amount)),description,created_by:(await supabase.auth.getUser()).data.user?.id}));}else({error}=await supabase.from('orders').insert({establishment_id:store.id,type:kind,total:Number(amount),notes:description,status:'new'}));if(error)onMessage(error.message);else{onMessage(type==='order'?'Pedido criado.':type==='cash'?'Movimentação registrada.':'Item salvo no cardápio.');await onSaved()}}const title=type==='order'?'Novo pedido':type==='cash'?'Movimentar caixa':'Novo item do cardápio';return <div className="modal-back"><form className="modal" onSubmit={submit}><button className="close" type="button" onClick={onClose}>×</button><h2>{title}</h2>{type==='order'&&<label>Canal<select value={kind} onChange={e=>setKind(e.target.value)}><option value="counter">Balcão</option><option value="pickup">Retirada</option><option value="delivery">Entrega</option></select></label>}{type==='cash'&&<label>Tipo<select value={kind} onChange={e=>setKind(e.target.value)}><option value="supply">Suprimento</option><option value="withdrawal">Retirada / sangria</option><option value="expense">Despesa</option></select></label>}<label>{type==='menu'?'Nome do produto':'Descrição'}<input value={type==='menu'||type==='order'?name:description} onChange={e=>type==='menu'||type==='order'?setName(e.target.value):setDescription(e.target.value)} required /></label>{type!=='cash'&&<label>Observação / descrição<input value={description} onChange={e=>setDescription(e.target.value)} /></label>}<label>{type==='menu'||type==='order'?'Valor total':'Valor'}<input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required /></label><button className="primary">Salvar</button></form></div>}


