import { useState, useEffect, useMemo, useRef } from 'react';
import './index.css';
import { supabase } from './supabaseClient';
import CRMTab from './components/CRMTab';
import FunilTab from './components/FunilTab';
import VendasTab from './components/VendasTab';
import DashboardTab from './components/DashboardTab';
import ConfigTab from './components/ConfigTab';
import InativosTab from './components/InativosTab';
import UsuariosTab from './components/UsuariosTab';
import LoginScreen from './components/LoginScreen';
import ClienteModal from './components/ClienteModal';
import PerfilTab from './components/PerfilTab';
import BackupTab from './components/BackupTab';
import ImportacaoTab from './components/ImportacaoTab';
import ResumoDemandasTab from './components/ResumoDemandasTab';
import RecebidosTab from './components/RecebidosTab';
import ClientesTab from './components/ClientesTab';

function splitForm(form) {
  const clienteData = {
    nome: form.nome,
    telefone: form.telefone,
    telefone2: form.telefone2 || null,
    email: form.email,
    entrada: form.entrada || new Date().toISOString().slice(0, 10),
    origem: form.origem || null,
    is_corretor: form.is_corretor || false,
  };
  const negociacaoData = {
    modalidade: form.modalidade,
    origem_tratativa: form.origem_tratativa || null,
    imovel: form.imovel,
    valor: form.valor ? Number(form.valor) : null,
    localizacao: form.localizacao,
    detalhes: form.detalhes,
    detalhes_externos: form.detalhes_externos || null,
    proxima_acao: form.proxima_acao,
    imoveis_visitados: form.imoveis_visitados,
    ultimo_contato: form.ultimo_contato || null,
    prox_contato: form.prox_contato || null,
    final_contato: form.final_contato || null,
    prorrogacao: form.prorrogacao || null,
    ativo: form.ativo,
    motivo_desistencia: form.ativo === 'S' ? '' : form.motivo_desistencia,
    solicitar_parceria: form.solicitar_parceria || false,
    tratativa: form.tratativa || false,
    pesquisa: form.pesquisa || false,
    agendamento: form.agendamento || false,
    visita: form.visita || false,
    proposta: form.proposta || false,
    contrato: form.contrato || false,
    financiamento: form.financiamento || false,
    recebimento: form.recebimento || false,
    recebido: form.recebido || false,
    corretor_id: form.corretor_id,
    corretor: form.corretor,
  };
  return { clienteData, negociacaoData };
}

export default function App() {
  const [tab, setTab] = useState('tratativas');
  const [clientes, setClientes] = useState([]);
  const [negociacoes, setNegociacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [modal, setModal] = useState(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('crm_dark') === 'true');
  const [filtroClienteId, setFiltroClienteId] = useState(null);
  const [abaFunil, setAbaFunil] = useState('compra');
  const sessionRef = useRef(null);

  useEffect(() => { document.body.classList.toggle('dark', darkMode); }, [darkMode]);

  function toggleDark() {
    setDarkMode(d => {
      const next = !d;
      localStorage.setItem('crm_dark', next);
      document.body.classList.toggle('dark', next);
      return next;
    });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      sessionRef.current = session;
      setSession(session);
      if (session) loadPerfil(session.user.id);
      else setCheckingAuth(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'SIGNED_OUT') { sessionRef.current = null; setSession(null); setPerfil(null); setCheckingAuth(false); }
      else if (_event === 'SIGNED_IN' && !sessionRef.current) { sessionRef.current = session; setSession(session); loadPerfil(session.user.id); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadPerfil(userId) {
    const { data } = await supabase.from('perfis').select('*').eq('id', userId).single();
    setPerfil(data);
    setCheckingAuth(false);
  }

  useEffect(() => { if (!session || !perfil) return; load(); }, [session, perfil]);

  async function load() {
    setLoading(true);
    const [{ data: clientesData, error: err1 }, { data: negData, error: err2 }] = await Promise.all([
      supabase.from('clientes').select('*').order('created_at', { ascending: false }),
      supabase.from('negociacoes').select('*').order('created_at', { ascending: false }),
    ]);
    if (err1 || err2) setError((err1 || err2).message);
    else { setClientes(clientesData || []); setNegociacoes(negData || []); }
    setLoading(false);
  }

  const data = useMemo(() => {
    return negociacoes.map(neg => {
      const cliente = clientes.find(c => c.id === neg.cliente_id) || {};
      return {
        ...neg,
        negociacao_id: neg.id,
        id: neg.id,
        cliente_real_id: cliente.id,
        nome: cliente.nome || '',
        telefone: cliente.telefone || '',
        email: cliente.email || '',
        entrada: cliente.entrada || '',
        origem: cliente.origem || '',
        is_corretor: cliente.is_corretor || false,
      };
    });
  }, [clientes, negociacoes]);

  // Permissões baseadas nas funções
  const isGerente = perfil?.is_gerente;
  const isCorretor = perfil?.is_corretor;
  const isEscritorio = perfil?.is_escritorio;
  const podeEditar = isGerente || isCorretor; // escritório só visualiza

  async function handleSave(form) {
    if (!podeEditar) return alert('Sem permissão para editar.');
    const { clienteData, negociacaoData } = splitForm(form);
    const editNegId = form.negociacao_id || null;
    const editClienteId = form.cliente_real_id || null;

    if (editNegId && editClienteId) {
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from('clientes').update(clienteData).eq('id', editClienteId),
        supabase.from('negociacoes').update(negociacaoData).eq('id', editNegId),
      ]);
      if (e1 || e2) return alert('Erro ao salvar: ' + (e1 || e2).message);
    } else {
      if (!isGerente) {
        negociacaoData.corretor_id = perfil.id;
        negociacaoData.corretor = perfil.nome;
        negociacaoData.corretor_original_id = perfil.id;
        negociacaoData.corretor_original = perfil.nome;
      } else {
        negociacaoData.corretor_original_id = negociacaoData.corretor_id;
        negociacaoData.corretor_original = negociacaoData.corretor;
      }
      // Verifica se cliente já existe
      if (editClienteId) {
        // Cliente já existe, só cria negociação
        const { error: e2 } = await supabase.from('negociacoes').insert({ ...negociacaoData, cliente_id: editClienteId });
        if (e2) return alert('Erro ao inserir tratativa: ' + e2.message);
      } else {
        const { data: novoCliente, error: e1 } = await supabase.from('clientes').insert(clienteData).select().single();
        if (e1) return alert('Erro ao inserir cliente: ' + e1.message);
        const { error: e2 } = await supabase.from('negociacoes').insert({ ...negociacaoData, cliente_id: novoCliente.id });
        if (e2) return alert('Erro ao inserir tratativa: ' + e2.message);
      }
    }
    localStorage.removeItem('crm_rascunho');
    setModal(null);
    await load();
  }

  async function handleNovaNegociacao(clienteRealId) {
    const cliente = clientes.find(c => c.id === clienteRealId);
    if (!cliente) return;
    setModal({ cliente, negociacao: null, novaNegociacao: true });
  }

  async function handleDelete(negId) {
    if (!podeEditar) return;
    const { error: err } = await supabase.from('negociacoes').delete().eq('id', negId);
    if (err) return alert('Erro ao excluir: ' + err.message);
    await load();
  }

  async function handleToggleFunil(negId, etapaOuUpdates, val) {
    if (!podeEditar) return;
    const updates = typeof etapaOuUpdates === 'object' ? etapaOuUpdates : { [etapaOuUpdates]: val };
    const { error: err } = await supabase.from('negociacoes').update(updates).eq('id', negId);
    if (err) return alert('Erro: ' + err.message);
    setNegociacoes(n => n.map(neg => neg.id === negId ? { ...neg, ...updates } : neg));
  }

  async function handleDevolver(negId) {
    const { error } = await supabase.from('negociacoes').update({ recebido: false, recebimento: false }).eq('id', negId);
    if (error) return alert('Erro: ' + error.message);
    await load();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setClientes([]); setNegociacoes([]); setPerfil(null);
  }

  const [abaFunil, setAbaFunil] = useState(() => localStorage.getItem('crm_funil_aba') || 'compra');

  function handleSetAbaFunil(aba) {
    setAbaFunil(aba);
    localStorage.setItem('crm_funil_aba', aba);
  }
    setFiltroClienteId(clienteId);
    setTab('tratativas');
  }

  const stats = useMemo(() => ({
    total: data.filter(c => c.ativo === 'S').length,
    compras: data.filter(c => c.ativo === 'S' && c.modalidade === 'Compra').length,
    locacoes: data.filter(c => c.ativo === 'S' && c.modalidade === 'Locação').length,
    vendas: data.filter(c => c.ativo === 'S' && c.modalidade === 'Venda').length,
    contratos: data.filter(c => c.contrato).length,
  }), [data]);

  if (checkingAuth) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', color: '#9ca3af' }}>Carregando...</div>
  );

  if (!session || !perfil) return <LoginScreen />;

  // Abas por função
  const todasAbas = [
    ['tratativas', 'Tratativas'],
    ['funil', 'Funil'],
    ['vendas', '🏠 Vendas'],
    ['dash', 'Dashboard'],
    ['recebidos', '💰 Recebidos'],
    ['inativos', 'Finalizadas'],
    ['resumo', '📋 Demandas'],
    ['clientes', '👤 Clientes'],
    ['usuarios', '👥 Usuários', 'gerente'],
    ['importacao', '📥 Importar', 'gerente_corretor'],
    ['config', '⚙️ Config'],
    ['backup', '💾 Backup', 'gerente'],
    ['perfil', '👤 Perfil'],
  ];

  const tabs = todasAbas.filter(([, , acesso]) => {
    if (!acesso) return true;
    if (acesso === 'gerente') return isGerente;
    if (acesso === 'gerente_corretor') return isGerente || isCorretor;
    return true;
  });

  const funcaoLabel = isGerente ? 'Gerente' : isCorretor ? 'Corretor' : isEscritorio ? 'Escritório' : '';
  const funcaoCor = isGerente ? '#2563eb' : isCorretor ? '#059669' : '#7c3aed';

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-logo">CRM <span>Imobiliário</span></div>
        <nav className="tab-nav">
          {tabs.map(([t, l]) => (
            <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => { setTab(t); setFiltroClienteId(null); }}>{l}</button>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            {perfil.nome} · <span style={{ color: funcaoCor, fontWeight: 600 }}>{funcaoLabel}</span>
          </span>
          <button onClick={toggleDark} style={{ background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 14, color: '#6b7280', cursor: 'pointer' }}>
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button onClick={handleLogout} style={{ background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 14px', fontSize: 12, color: '#6b7280', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            Sair
          </button>
        </div>
      </header>

      <div className="stats-bar">
        <div className="stat-item"><span className="stat-label">Tratativas</span><span className="stat-value stat-blue">{stats.total}</span></div>
        <div className="stat-item"><span className="stat-label">Compras</span><span className="stat-value stat-green">{stats.compras}</span></div>
        <div className="stat-item"><span className="stat-label">Locações</span><span className="stat-value stat-purple">{stats.locacoes}</span></div>
        <div className="stat-item"><span className="stat-label">Vendas</span><span className="stat-value stat-orange">{stats.vendas}</span></div>
        <div className="stat-item"><span className="stat-label">Contratos</span><span className="stat-value stat-green">{stats.contratos}</span></div>
      </div>

      {error && <div className="error-banner">⚠️ Erro de conexão: {error}</div>}

      <main className="main">
        {loading ? <div className="loading">Carregando dados...</div> : (
          <>
            {tab === 'clientes' && <ClientesTab clientes={clientes} negociacoes={negociacoes} onVerTratativas={handleVerTratativas} onNovaTratativa={podeEditar ? handleNovaNegociacao : null} onReload={load} />}
            {tab === 'tratativas' && <CRMTab
              data={filtroClienteId ? data.filter(c => c.cliente_real_id === filtroClienteId && c.ativo === 'S' && !c.recebido) : data.filter(c => c.ativo === 'S' && !c.recebido)}
              onOpenModal={podeEditar ? setModal : null}
              onDelete={podeEditar ? handleDelete : null}
              onToggleFunil={handleToggleFunil}
              onNovaNegociacao={podeEditar ? handleNovaNegociacao : null}
              isGerente={isGerente}
              filtroClienteNome={filtroClienteId ? clientes.find(c => c.id === filtroClienteId)?.nome : null}
              onLimparFiltro={() => setFiltroClienteId(null)}
            />}
            {tab === 'funil' && <FunilTab data={data.filter(c => c.ativo === 'S' && !c.recebido)} onOpenModal={podeEditar ? setModal : null} onMoverCard={(id, updates) => setNegociacoes(n => n.map(neg => neg.id === id ? { ...neg, ...updates } : neg))} abaFunil={abaFunil} onSetAbaFunil={handleSetAbaFunil} />}
            {tab === 'vendas' && <VendasTab data={data} onOpenModal={podeEditar ? setModal : null} onToggleFunil={handleToggleFunil} />}
            {tab === 'dash' && <DashboardTab data={data} />}
            {tab === 'recebidos' && <RecebidosTab data={data} onOpenModal={podeEditar ? setModal : null} onDevolver={podeEditar ? handleDevolver : null} />}
            {tab === 'inativos' && <InativosTab data={data.filter(c => c.ativo === 'N')} onOpenModal={podeEditar ? setModal : null} onDelete={podeEditar ? handleDelete : null} />}
            {tab === 'resumo' && <ResumoDemandasTab data={data} darkMode={darkMode} />}
            {tab === 'usuarios' && isGerente && <UsuariosTab />}
            {tab === 'importacao' && (isGerente || isCorretor) && <ImportacaoTab perfil={perfil} darkMode={darkMode} onImportSuccess={load} />}
            {tab === 'config' && <ConfigTab perfil={perfil} />}
            {tab === 'backup' && isGerente && <BackupTab />}
            {tab === 'perfil' && <PerfilTab perfil={perfil} onUpdate={setPerfil} />}
          </>
        )}
      </main>

      {modal !== null && podeEditar && (
        <ClienteModal
          modal={modal}
          onSave={handleSave}
          onClose={() => { localStorage.removeItem('crm_rascunho'); setModal(null); }}
          perfil={perfil}
        />
      )}

      {/* Botão flutuante global — Nova Tratativa */}
      {podeEditar && modal === null && (
        <button
          onClick={() => setModal('new')}
          title="Nova Tratativa"
          style={{
            position: 'fixed', bottom: 28, right: 28, zIndex: 999,
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: '#fff', border: 'none', fontSize: 26, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 4px 20px rgba(37,99,235,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(37,99,235,0.65)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(37,99,235,0.5)'; }}
        >
          +
        </button>
      )}
    </div>
  );
}
