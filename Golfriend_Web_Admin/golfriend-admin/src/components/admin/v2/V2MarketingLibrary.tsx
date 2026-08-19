import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { filterMarketingAssets, marketingSummary, MARKETING_CATEGORIES, MARKETING_LOCALES, MARKETING_STATUSES, type MarketingAsset } from './marketingLibraryModel.mjs';
import { firebaseMarketingLibraryProvider, type History, type MarketingLibraryProvider } from './marketingLibraryProvider';
import MarketingSections from './MarketingSections';
import './V2MarketingLibrary.css';
import './MarketingAssetRuntime.css';
import { useDialogFocus } from './useDialogFocus';
import { useAdminLocale } from './AdminLocaleContext';
import type { AdminLocale } from './adminNavigation';

const EN = {
  title: 'Marketing Asset Library',
  lead: 'Server-authoritative assets, versions, review states and immutable audit receipts.',
  loading: 'Loading marketing assets…',
  empty: 'No marketing assets have been created.',
  error: 'Marketing Asset Library is unavailable.',
  unconfigured: 'File storage is not configured. Uploads and downloads fail closed.',
  storageConfigured: 'Storage configured',
  storageConfiguredHelp: 'Server-validated and audited.',
  search: 'Search assets',
  category: 'Category',
  state: 'State',
  locales: 'Locales',
  upload: 'Create asset and upload',
  name: 'Asset title',
  page: 'App page or destination',
  file: 'File',
  create: 'Create and upload',
  close: 'Close',
  history: 'Version and audit history',
  download: 'Audited preview / download',
  newVersion: 'Upload new version',
  review: 'Send to review',
  approve: 'Approve',
  archive: 'Archive',
  draft: 'Return to draft',
  working: 'Working…',
  noHistory: 'No version or audit history yet.',
  all: 'All',
  total: 'Total',
  localeCoverage: 'Locale coverage',
  localeContract: 'Eight-locale contract',
  versions: 'Versions',
  updated: 'Updated',
  authority: 'ADMIN · FIREBASE AUTHORITY',
  notAvailable: '—',
  statusDraft: 'Draft',
  statusReview: 'Review',
  statusApproved: 'Approved',
  statusArchived: 'Archived',
};

const COPY: Record<AdminLocale, typeof EN> = {
  en: EN,
  th: {
    ...EN,
    title: 'คลังสื่อการตลาด',
    lead: 'ทรัพยากรที่ได้รับการยืนยันจากผู้ดูแลแบบ authoritative พร้อมเวอร์ชัน สถานะการตรวจสอบ และใบเสร็จตรวจสอบที่คงที่ไม่เปลี่ยนแปลง',
    loading: 'กำลังโหลดสื่อการตลาด…',
    empty: 'ยังไม่มีสื่อการตลาด',
    error: 'ไม่สามารถใช้คลังสื่อการตลาดได้',
    unconfigured: 'ที่เก็บไฟล์ยังไม่ได้ตั้งค่า การอัปโหลดและดาวน์โหลดถูกปิดโดยอัตโนมัติ',
    storageConfigured: 'ตั้งค่าที่เก็บไฟล์แล้ว',
    storageConfiguredHelp: 'ผ่านการตรวจสอบและตรวจนับโดยเซิร์ฟเวอร์',
    search: 'ค้นหาสินทรัพย์',
    category: 'หมวดหมู่',
    state: 'สถานะ',
    locales: 'ภาษา',
    upload: 'สร้างและอัปโหลดสินทรัพย์',
    name: 'ชื่อสินทรัพย์',
    page: 'หน้าแอปหรือตำแหน่งปลายทาง',
    file: 'ไฟล์',
    create: 'สร้างและอัปโหลด',
    close: 'ปิด',
    history: 'ประวัติเวอร์ชันและการตรวจสอบ',
    download: 'ตัวอย่าง/ดาวน์โหลดตรวจสอบได้',
    newVersion: 'อัปโหลดเวอร์ชันใหม่',
    review: 'ส่งตรวจสอบ',
    approve: 'อนุมัติ',
    archive: 'เก็บถาวร',
    draft: 'กลับสู่ฉบับร่าง',
    noHistory: 'ยังไม่มีประวัติเวอร์ชันหรือใบเสร็จ',
    all: 'ทั้งหมด',
    total: 'รวม',
    localeCoverage: 'ความครอบคลุมภาษา',
    localeContract: 'สัญญา 8 ภาษา',
    versions: 'เวอร์ชัน',
    updated: 'อัปเดตล่าสุด',
    authority: 'สิทธิ์ผู้ดูแล · FIREBASE',
    statusDraft: 'ฉบับร่าง',
    statusReview: 'รอรีวิว',
    statusApproved: 'ผ่านอนุมัติ',
    statusArchived: 'เก็บถาวร',
  },
  ko: {
    ...EN,
    title: '마케팅 자산 라이브러리',
    lead: '서버 권한 기반 자산, 버전, 검수 상태 및 변경 불가 감사 영수증.',
    loading: '마케팅 자산을 불러오는 중…',
    empty: '생성된 마케팅 자산이 없습니다.',
    error: '마케팅 자산 라이브러리를 사용할 수 없습니다.',
    unconfigured: '파일 저장소가 구성되지 않았습니다. 업로드/다운로드가 차단됩니다.',
    storageConfigured: '저장소 구성됨',
    storageConfiguredHelp: '서버 검증 및 감사 처리됨.',
    search: '자산 검색',
    category: '카테고리',
    state: '상태',
    locales: '언어',
    upload: '자산 생성 및 업로드',
    name: '자산 제목',
    page: '앱 페이지 또는 대상',
    file: '파일',
    create: '생성하고 업로드',
    close: '닫기',
    history: '버전 및 감사 이력',
    download: '감사 미리보기/다운로드',
    newVersion: '새 버전 업로드',
    review: '검토로 보내기',
    approve: '승인',
    archive: '보관',
    draft: '임시저장으로 되돌리기',
    noHistory: '버전 또는 감사 이력이 아직 없습니다.',
    all: '전체',
    total: '총계',
    localeCoverage: '언어 커버리지',
    localeContract: '8개 언어 계약',
    versions: '버전',
    updated: '업데이트',
    authority: '관리자 · FIREBASE 권한',
    statusDraft: '초안',
    statusReview: '검토 중',
    statusApproved: '승인됨',
    statusArchived: '보관됨',
  },
  ja: {
    ...EN,
    title: 'マーケティング素材ライブラリ',
    lead: 'サーバー権威のアセット、バージョン、レビュー状態、変更不可の監査受領領収書。',
    loading: '素材を読み込み中…',
    empty: '作成済みの素材はありません。',
    error: '素材ライブラリを利用できません。',
    unconfigured: 'ファイル保存領域が未設定です。アップロードとダウンロードは失敗クローズです。',
    storageConfigured: 'ストレージは設定済み',
    storageConfiguredHelp: 'サーバー検証・監査済み。',
    search: '素材を検索',
    category: 'カテゴリ',
    state: 'ステータス',
    locales: 'ロケール',
    upload: '素材作成とアップロード',
    name: '素材名',
    page: 'アプリページ / 遷移先',
    file: 'ファイル',
    create: '作成してアップロード',
    close: '閉じる',
    history: 'バージョンと監査履歴',
    download: '監査プレビュー / ダウンロード',
    newVersion: '新規バージョンアップロード',
    review: 'レビューへ送信',
    approve: '承認',
    archive: 'アーカイブ',
    draft: '下書きに戻す',
    noHistory: 'まだバージョンまたは監査履歴がありません。',
    all: 'すべて',
    total: '合計',
    localeCoverage: 'ロケールカバレッジ',
    localeContract: '8言語契約',
    versions: 'バージョン',
    updated: '更新日',
    authority: '管理者 · FIREBASE 権限',
    statusDraft: '下書き',
    statusReview: 'レビュー',
    statusApproved: '承認済み',
    statusArchived: 'アーカイブ済み',
  },
  zh: {
    ...EN,
    title: '营销素材库',
    lead: '基于服务器授权的素材、版本、审核状态与不可变审计回执。',
    loading: '正在加载营销素材…',
    empty: '尚未创建营销素材。',
    error: '营销素材库不可用。',
    unconfigured: '文件存储未配置，上传与下载已关闭。',
    storageConfigured: '存储已配置',
    storageConfiguredHelp: '已通过服务器验证和审计。',
    search: '搜索素材',
    category: '分类',
    state: '状态',
    locales: '语言',
    upload: '创建并上传素材',
    name: '素材名称',
    page: '应用页面或目标',
    file: '文件',
    create: '创建并上传',
    close: '关闭',
    history: '版本与审计记录',
    download: '审计预览/下载',
    newVersion: '上传新版本',
    review: '提交审核',
    approve: '批准',
    archive: '归档',
    draft: '退回草稿',
    noHistory: '尚无版本或审计历史。',
    all: '全部',
    total: '总计',
    localeCoverage: '语言覆盖',
    localeContract: '8 语言合约',
    versions: '版本',
    updated: '更新时间',
    authority: '管理员 · FIREBASE 权限',
    statusDraft: '草稿',
    statusReview: '审核中',
    statusApproved: '已批准',
    statusArchived: '已归档',
  },
  es: {
    ...EN,
    title: 'Biblioteca de recursos de marketing',
    lead: 'Recursos con autoridad del servidor, versiones, estados de revisión y recibos de auditoría inmutables.',
    loading: 'Cargando recursos…',
    empty: 'No se han creado recursos.',
    error: 'La biblioteca no está disponible.',
    unconfigured: 'El almacenamiento de archivos no está configurado. Las cargas y descargas están cerradas.',
    storageConfigured: 'Almacenamiento configurado',
    storageConfiguredHelp: 'Validado y auditado por servidor.',
    search: 'Buscar recursos',
    category: 'Categoría',
    state: 'Estado',
    locales: 'Idiomas',
    upload: 'Crear recurso y cargar',
    name: 'Título del recurso',
    page: 'Página o destino de la app',
    file: 'Archivo',
    create: 'Crear y cargar',
    close: 'Cerrar',
    history: 'Versiones y historial de auditoría',
    download: 'Vista previa / descarga auditada',
    newVersion: 'Cargar nueva versión',
    review: 'Enviar a revisión',
    approve: 'Aprobar',
    archive: 'Archivar',
    draft: 'Volver a borrador',
    noHistory: 'Aún no hay historial de versiones o auditoría.',
    all: 'Todo',
    total: 'Total',
    localeCoverage: 'Cobertura de idiomas',
    localeContract: 'Contrato en 8 idiomas',
    versions: 'Versiones',
    updated: 'Actualizado',
    authority: 'ADMIN · FIREBASE AUTORIDAD',
    statusDraft: 'Borrador',
    statusReview: 'Revisión',
    statusApproved: 'Aprobado',
    statusArchived: 'Archivado',
  },
  fr: {
    ...EN,
    title: 'Bibliothèque des ressources marketing',
    lead: 'Actifs, versions, états de revue et reçus d’audit immuables avec autorité serveur.',
    loading: 'Chargement des ressources…',
    empty: 'Aucune ressource créée.',
    error: 'Bibliothèque indisponible.',
    unconfigured: 'Le stockage de fichiers n’est pas configuré. Les téléchargements/chargements sont fermés.',
    storageConfigured: 'Stockage configuré',
    storageConfiguredHelp: 'Validé et audité par le serveur.',
    search: 'Rechercher des ressources',
    category: 'Catégorie',
    state: 'État',
    locales: 'Langues',
    upload: 'Créer une ressource et télécharger',
    name: 'Titre de la ressource',
    page: 'Page app ou destination',
    file: 'Fichier',
    create: 'Créer et télécharger',
    close: 'Fermer',
    history: 'Historique des versions et audits',
    download: 'Aperçu/ téléchargement audité',
    newVersion: 'Télécharger une nouvelle version',
    review: 'Envoyer en revue',
    approve: 'Approuver',
    archive: 'Archiver',
    draft: 'Retour à brouillon',
    noHistory: 'Aucun historique de version ni d’audit pour l’instant.',
    all: 'Tous',
    total: 'Total',
    localeCoverage: 'Couverture langues',
    localeContract: 'Contrat 8 langues',
    versions: 'Versions',
    updated: 'Mis à jour',
    authority: 'ADMIN · AUTORITÉ FIREBASE',
    statusDraft: 'Brouillon',
    statusReview: 'En révision',
    statusApproved: 'Approuvé',
    statusArchived: 'Archivé',
  },
  de: {
    ...EN,
    title: 'Marketing-Asset-Bibliothek',
    lead: 'Server-gesteuerte Assets, Versionen, Prüfzustände und unveränderbare Audit-Belege.',
    loading: 'Marketing-Assets werden geladen…',
    empty: 'Es wurden keine Assets erstellt.',
    error: 'Die Bibliothek ist nicht verfügbar.',
    unconfigured: 'Dateispeicher ist nicht konfiguriert. Uploads und Downloads sind blockiert.',
    storageConfigured: 'Storage konfiguriert',
    storageConfiguredHelp: 'Server-validiert und geprüft.',
    search: 'Assets suchen',
    category: 'Kategorie',
    state: 'Status',
    locales: 'Sprachen',
    upload: 'Asset erstellen und hochladen',
    name: 'Asset-Titel',
    page: 'App-Seite oder Ziel',
    file: 'Datei',
    create: 'Erstellen und hochladen',
    close: 'Schließen',
    history: 'Versions- und Audit-Historie',
    download: 'Geprüfte Vorschau / Download',
    newVersion: 'Neue Version hochladen',
    review: 'Zur Prüfung senden',
    approve: 'Genehmigen',
    archive: 'Archivieren',
    draft: 'Zurück zum Entwurf',
    noHistory: 'Noch keine Versionen oder Audit-Historie.',
    all: 'Alle',
    total: 'Gesamt',
    localeCoverage: 'Sprachabdeckung',
    localeContract: '8-Sprach-Vertrag',
    versions: 'Versionen',
    updated: 'Aktualisiert',
    authority: 'ADMIN · FIREBASE-BERECHTIGUNG',
    statusDraft: 'Entwurf',
    statusReview: 'In Prüfung',
    statusApproved: 'Genehmigt',
    statusArchived: 'Archiviert',
  },
};

const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const statusLabel = (copy: typeof EN) => ({
  draft: copy.statusDraft,
  review: copy.statusReview,
  approved: copy.statusApproved,
  archived: copy.statusArchived,
});

export default function V2MarketingLibrary({
  provider = firebaseMarketingLibraryProvider,
}: {
  provider?: MarketingLibraryProvider;
}) {
  const copy = COPY[useAdminLocale()];
  const [snapshot, setSnapshot] = useState<any>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [locale, setLocale] = useState('all');
  const [selected, setSelected] = useState<MarketingAsset | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const detailRef = useDialogFocus(Boolean(selected), () => setSelected(null));

  const load = useCallback(async () => {
    setState('loading');
    try {
      setSnapshot(await provider.load());
      setState('ready');
    } catch {
      setState('error');
    }
  }, [provider]);

  useEffect(() => {
    void load();
  }, [load]);

  const assets = snapshot?.assets || [];
  const summary = useMemo(() => marketingSummary(assets), [assets]);
  const visible = useMemo(
    () => filterMarketingAssets(assets, { query, category, status, locale }),
    [assets, query, category, status, locale]
  );

  const run = async (task: () => Promise<any>) => {
    setBusy(true);
    setNotice('');
    try {
      await task();
      await load();
      setNotice('OK');
    } catch (error: any) {
      setNotice(error?.message?.includes('PROVIDER_UNCONFIGURED') ? copy.unconfigured : copy.error);
    } finally {
      setBusy(false);
    }
  };

  const open = async (asset: MarketingAsset) => {
    setSelected(asset);
    setHistory(null);
    try {
      setHistory(await provider.history(asset.assetId));
    } catch {
      setNotice(copy.error);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const file = form.get('file') as File;
    const locales = form.getAll('locales').map(String);

    await run(async () => {
      const receipt = await provider.create({
        title: form.get('title'),
        category: form.get('category'),
        page: form.get('page'),
        locales,
      });

      await provider.upload({ assetId: receipt.assetId, file });
    });

    target.reset();
  };

  const stateLabels = statusLabel(copy);

  if (state === 'loading') {
    return <p role="status" aria-live="polite">{copy.loading}</p>;
  }

  if (state === 'error') {
    return <p role="alert">{copy.error}</p>;
  }

  return (
    <div className="marketing-library">
      <header className="marketing-hero">
        <div>
          <span>{copy.authority}</span>
          <h2>{copy.title}</h2>
          <p>{copy.lead}</p>
        </div>
        <aside>
          <strong>{snapshot.storageConfigured ? copy.storageConfigured : 'PROVIDER_UNCONFIGURED'}</strong>
          <small>
            {snapshot.storageConfigured ? copy.storageConfiguredHelp : copy.unconfigured}
          </small>
        </aside>
      </header>
      <MarketingSections assets={assets} />
      <section className="marketing-metrics" aria-label={copy.title}>
        <article>
          <span>{copy.total}</span>
          <strong>{summary.total}</strong>
        </article>
        {MARKETING_STATUSES.map((item) => (
          <article key={item}>
            <span>{stateLabels[item as keyof typeof stateLabels] || label(item)}</span>
            <strong>{summary.byStatus[item]}</strong>
          </article>
        ))}
      </section>
      <section className="marketing-coverage" aria-label={copy.localeCoverage}>
        <div>
          <h3>{copy.localeContract}</h3>
        </div>
        {MARKETING_LOCALES.map((item) => (
          <article key={item}>
            <strong>{item}</strong>
            <span>{summary.coverage[item]}</span>
          </article>
        ))}
      </section>
      <form className="marketing-upload" onSubmit={(e) => void submit(e)} aria-label={copy.upload}>
        <h3>{copy.upload}</h3>
        <label>
          {copy.name}
          <input name="title" required maxLength={120} />
        </label>
        <label>
          {copy.category}
          <select name="category">
            {MARKETING_CATEGORIES.map((item) => (
              <option key={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy.page}
          <input name="page" required maxLength={120} />
        </label>
        <fieldset>
          <legend>{copy.locales}</legend>
          {MARKETING_LOCALES.map((item) => (
            <label key={item}>
              <input type="checkbox" name="locales" value={item} />
              {item}
            </label>
          ))}
        </fieldset>
        <label>
          {copy.file}
          <input
            name="file"
            type="file"
            required
            accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf,text/plain,text/markdown,.docx"
          />
        </label>
        <button disabled={busy || !snapshot.storageConfigured}>{busy ? copy.working : copy.create}</button>
      </form>
      {notice && <p role={notice === 'OK' ? 'status' : 'alert'}>{notice}</p>}
      <section className="marketing-catalogue">
        <div className="marketing-toolbar">
          <input
            aria-label={copy.search}
            placeholder={copy.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select aria-label={copy.category} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">{copy.all}</option>
            {MARKETING_CATEGORIES.map((item) => (
              <option key={item}>{label(item)}</option>
            ))}
          </select>
          <select aria-label={copy.state} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">{copy.all}</option>
            {MARKETING_STATUSES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select aria-label={copy.locales} value={locale} onChange={(e) => setLocale(e.target.value)}>
            <option value="all">{copy.all}</option>
            {MARKETING_LOCALES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        {!visible.length ? (
          <p className="marketing-state">{copy.empty}</p>
        ) : (
          <div className="marketing-table-wrap" tabIndex={0}>
            <table>
              <caption>{copy.title}</caption>
              <thead>
                <tr>
                  <th>{copy.name}</th>
                  <th>{copy.category}</th>
                  <th>{copy.page}</th>
                  <th>{copy.locales}</th>
                  <th>{copy.state}</th>
                  <th>{copy.versions}</th>
                  <th>{copy.updated}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((asset) => (
                  <tr key={asset.assetId}>
                    <td>
                      <button className="asset-link" onClick={() => void open(asset)}>
                        {asset.title}
                      </button>
                    </td>
                    <td>{label(asset.category)}</td>
                    <td>{asset.page}</td>
                    <td>{asset.locales.join(', ')}</td>
                    <td>{stateLabels[asset.state as keyof typeof stateLabels] || label(asset.state)}</td>
                    <td>{asset.versionCount}</td>
                    <td>{asset.updatedAt || copy.notAvailable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selected && (
        <div ref={detailRef} className="asset-detail" role="dialog" aria-modal="true" aria-labelledby="asset-detail-title">
          <button className="asset-close" onClick={() => setSelected(null)}>
            {copy.close}
          </button>
          <h3 id="asset-detail-title">{selected.title}</h3>
          <p>
            {selected.category} · {selected.page} · {selected.locales.join(', ')}
          </p>
          <div className="asset-actions">
            <button
              disabled={busy || !selected.available || !snapshot.storageConfigured}
              onClick={() =>
                void run(async () => {
                  const result = await provider.download(selected.assetId);
                  window.open(result.url, '_blank', 'noopener');
                })
              }
            >
              {copy.download}
            </button>
            {selected.state === 'draft' && (
              <button disabled={busy} onClick={() => void run(() => provider.transition(selected.assetId, 'review'))}>
                {copy.review}
              </button>
            )}
            {selected.state === 'review' && (
              <>
                <button disabled={busy} onClick={() => void run(() => provider.transition(selected.assetId, 'approved'))}>
                  {copy.approve}
                </button>
                <button disabled={busy} onClick={() => void run(() => provider.transition(selected.assetId, 'draft'))}>
                  {copy.draft}
                </button>
              </>
            )}
            {selected.state !== 'archived' && (
              <button disabled={busy} onClick={() => void run(() => provider.transition(selected.assetId, 'archived'))}>
                {copy.archive}
              </button>
            )}
          </div>
          <label>
            {copy.newVersion}
            <input
              type="file"
              disabled={busy || !snapshot.storageConfigured}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void run(() => provider.upload({ assetId: selected.assetId, file }));
                }
              }}
            />
          </label>
          <h4>{copy.history}</h4>
          {!history ? (
            <p role="status">{copy.loading}</p>
          ) : history.versions.length + history.receipts.length === 0 ? (
            <p>{copy.noHistory}</p>
          ) : (
            <>
              <ul>
                {history.versions.map((v: any) => (
                  <li key={v.versionId}>
                    {v.versionId} · {v.fileName} · {v.sizeBytes} bytes
                  </li>
                ))}
              </ul>
              <ol>
                {history.receipts.map((r: any) => (
                  <li key={r.id}>
                    {r.kind} · {r.actorRole} · {r.id}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
