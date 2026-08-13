// Eight-locale strings for the partner Course & Availability surface (L1 slice 3):
// claim/onboard a course and publish/manage bookable tee-times.
// Messages with {name}/{date}/{time} are filled by the component via replace().
import type { LocaleDict } from '../dict.ts';

export type CAKey =
  | 'title' | 'subtitle' | 'step1' | 'step2'
  | 'onboardPlaceholder' | 'onboard' | 'publishLocked'
  | 'yourCourse' | 'date' | 'time' | 'capacity' | 'publish'
  | 'invHeader' | 'noSlots' | 'colCourse' | 'colDate' | 'colTime' | 'colBookedCap' | 'colStatus' | 'colAction'
  | 'close' | 'open' | 'stOpen' | 'stClosed'
  | 'selectToOnboard' | 'onboardedMsg' | 'onboardFailed'
  | 'selectCourseFirst' | 'publishedMsg' | 'publishFailed'
  | 'slotOpenedMsg' | 'slotClosedMsg' | 'slotFailed';

export const COURSE_AVAILABILITY: LocaleDict<CAKey> = {
  en: {
    title: 'Course & Availability', subtitle: 'Onboard the course you operate, then publish bookable tee-times.',
    step1: '1 · Onboard a Course', step2: '2 · Publish Availability',
    onboardPlaceholder: 'Select a course to onboard…', onboard: 'ONBOARD',
    publishLocked: 'Onboard a course above to unlock availability publishing.',
    yourCourse: 'Your course', date: 'Date', time: 'Time', capacity: 'Capacity', publish: 'PUBLISH',
    invHeader: 'Your Published Tee-Times', noSlots: 'No tee-times published yet.',
    colCourse: 'Course', colDate: 'Date', colTime: 'Time', colBookedCap: 'Booked / Cap', colStatus: 'Status', colAction: 'Action',
    close: 'Close', open: 'Open', stOpen: 'Open', stClosed: 'Closed',
    selectToOnboard: 'Select a course to onboard.', onboardedMsg: 'Onboarded {name}. You can now publish its tee-times.', onboardFailed: 'Could not onboard the course. Please try again.',
    selectCourseFirst: 'Select one of your courses first.', publishedMsg: 'Published tee-time {date} {time}.', publishFailed: 'Could not publish the tee-time. Please try again.',
    slotOpenedMsg: 'Tee-time opened.', slotClosedMsg: 'Tee-time closed.', slotFailed: 'Could not update the tee-time. Please try again.',
  },
  th: {
    title: 'สนามและตารางว่าง', subtitle: 'ลงทะเบียนสนามที่คุณดูแล จากนั้นเผยแพร่เวลาออกรอบที่จองได้',
    step1: '1 · ลงทะเบียนสนาม', step2: '2 · เผยแพร่ตารางว่าง',
    onboardPlaceholder: 'เลือกสนามเพื่อลงทะเบียน…', onboard: 'ลงทะเบียน',
    publishLocked: 'ลงทะเบียนสนามด้านบนเพื่อปลดล็อกการเผยแพร่ตารางว่าง',
    yourCourse: 'สนามของคุณ', date: 'วันที่', time: 'เวลา', capacity: 'จำนวนที่รับได้', publish: 'เผยแพร่',
    invHeader: 'เวลาออกรอบที่คุณเผยแพร่', noSlots: 'ยังไม่มีเวลาออกรอบที่เผยแพร่',
    colCourse: 'สนาม', colDate: 'วันที่', colTime: 'เวลา', colBookedCap: 'จองแล้ว / ทั้งหมด', colStatus: 'สถานะ', colAction: 'การดำเนินการ',
    close: 'ปิด', open: 'เปิด', stOpen: 'เปิด', stClosed: 'ปิด',
    selectToOnboard: 'เลือกสนามเพื่อลงทะเบียน', onboardedMsg: 'ลงทะเบียน {name} แล้ว คุณสามารถเผยแพร่เวลาออกรอบได้แล้ว', onboardFailed: 'ไม่สามารถลงทะเบียนสนามได้ กรุณาลองใหม่',
    selectCourseFirst: 'กรุณาเลือกสนามของคุณก่อน', publishedMsg: 'เผยแพร่เวลาออกรอบ {date} {time} แล้ว', publishFailed: 'ไม่สามารถเผยแพร่เวลาออกรอบได้ กรุณาลองใหม่',
    slotOpenedMsg: 'เปิดเวลาออกรอบแล้ว', slotClosedMsg: 'ปิดเวลาออกรอบแล้ว', slotFailed: 'ไม่สามารถอัปเดตเวลาออกรอบได้ กรุณาลองใหม่',
  },
  ko: {
    title: '코스 및 예약 가능 시간', subtitle: '운영하는 코스를 등록한 다음 예약 가능한 티타임을 게시하세요.',
    step1: '1 · 코스 등록', step2: '2 · 예약 가능 시간 게시',
    onboardPlaceholder: '등록할 코스를 선택하세요…', onboard: '등록',
    publishLocked: '위에서 코스를 등록하면 예약 가능 시간 게시가 활성화됩니다.',
    yourCourse: '내 코스', date: '날짜', time: '시간', capacity: '수용 인원', publish: '게시',
    invHeader: '게시된 티타임', noSlots: '아직 게시된 티타임이 없습니다.',
    colCourse: '코스', colDate: '날짜', colTime: '시간', colBookedCap: '예약 / 정원', colStatus: '상태', colAction: '작업',
    close: '닫기', open: '열기', stOpen: '오픈', stClosed: '마감',
    selectToOnboard: '등록할 코스를 선택하세요.', onboardedMsg: '{name}을(를) 등록했습니다. 이제 티타임을 게시할 수 있습니다.', onboardFailed: '코스를 등록할 수 없습니다. 다시 시도하세요.',
    selectCourseFirst: '먼저 코스를 선택하세요.', publishedMsg: '{date} {time} 티타임을 게시했습니다.', publishFailed: '티타임을 게시할 수 없습니다. 다시 시도하세요.',
    slotOpenedMsg: '티타임을 열었습니다.', slotClosedMsg: '티타임을 마감했습니다.', slotFailed: '티타임을 업데이트할 수 없습니다. 다시 시도하세요.',
  },
  ja: {
    title: 'コースと空き状況', subtitle: '運営するコースを登録し、予約可能なスタート時間を公開します。',
    step1: '1 · コースを登録', step2: '2 · 空き状況を公開',
    onboardPlaceholder: '登録するコースを選択…', onboard: '登録',
    publishLocked: '上でコースを登録すると空き状況の公開が有効になります。',
    yourCourse: 'あなたのコース', date: '日付', time: '時間', capacity: '定員', publish: '公開',
    invHeader: '公開中のスタート時間', noSlots: 'まだ公開されたスタート時間はありません。',
    colCourse: 'コース', colDate: '日付', colTime: '時間', colBookedCap: '予約 / 定員', colStatus: '状態', colAction: '操作',
    close: '閉じる', open: '開く', stOpen: '公開', stClosed: '締切',
    selectToOnboard: '登録するコースを選択してください。', onboardedMsg: '{name} を登録しました。スタート時間を公開できます。', onboardFailed: 'コースを登録できませんでした。もう一度お試しください。',
    selectCourseFirst: 'まずご自分のコースを選択してください。', publishedMsg: 'スタート時間 {date} {time} を公開しました。', publishFailed: 'スタート時間を公開できませんでした。もう一度お試しください。',
    slotOpenedMsg: 'スタート時間を公開しました。', slotClosedMsg: 'スタート時間を締め切りました。', slotFailed: 'スタート時間を更新できませんでした。もう一度お試しください。',
  },
  zh: {
    title: '球场与可预订时间', subtitle: '登记您运营的球场，然后发布可预订的开球时间。',
    step1: '1 · 登记球场', step2: '2 · 发布可预订时间',
    onboardPlaceholder: '选择要登记的球场…', onboard: '登记',
    publishLocked: '在上方登记球场后即可发布可预订时间。',
    yourCourse: '您的球场', date: '日期', time: '时间', capacity: '容量', publish: '发布',
    invHeader: '您已发布的开球时间', noSlots: '尚未发布开球时间。',
    colCourse: '球场', colDate: '日期', colTime: '时间', colBookedCap: '已订 / 容量', colStatus: '状态', colAction: '操作',
    close: '关闭', open: '开放', stOpen: '开放', stClosed: '关闭',
    selectToOnboard: '请选择要登记的球场。', onboardedMsg: '已登记 {name}。您现在可以发布其开球时间。', onboardFailed: '无法登记球场。请重试。',
    selectCourseFirst: '请先选择您的球场。', publishedMsg: '已发布开球时间 {date} {time}。', publishFailed: '无法发布开球时间。请重试。',
    slotOpenedMsg: '已开放开球时间。', slotClosedMsg: '已关闭开球时间。', slotFailed: '无法更新开球时间。请重试。',
  },
  es: {
    title: 'Campo y disponibilidad', subtitle: 'Incorpora el campo que operas y luego publica horas de salida reservables.',
    step1: '1 · Incorporar un campo', step2: '2 · Publicar disponibilidad',
    onboardPlaceholder: 'Selecciona un campo para incorporar…', onboard: 'INCORPORAR',
    publishLocked: 'Incorpora un campo arriba para habilitar la publicación de disponibilidad.',
    yourCourse: 'Tu campo', date: 'Fecha', time: 'Hora', capacity: 'Capacidad', publish: 'PUBLICAR',
    invHeader: 'Tus horas de salida publicadas', noSlots: 'Aún no hay horas de salida publicadas.',
    colCourse: 'Campo', colDate: 'Fecha', colTime: 'Hora', colBookedCap: 'Reservadas / Cap.', colStatus: 'Estado', colAction: 'Acción',
    close: 'Cerrar', open: 'Abrir', stOpen: 'Abierta', stClosed: 'Cerrada',
    selectToOnboard: 'Selecciona un campo para incorporar.', onboardedMsg: 'Se incorporó {name}. Ya puedes publicar sus horas de salida.', onboardFailed: 'No se pudo incorporar el campo. Inténtalo de nuevo.',
    selectCourseFirst: 'Selecciona primero uno de tus campos.', publishedMsg: 'Hora de salida publicada {date} {time}.', publishFailed: 'No se pudo publicar la hora de salida. Inténtalo de nuevo.',
    slotOpenedMsg: 'Hora de salida abierta.', slotClosedMsg: 'Hora de salida cerrada.', slotFailed: 'No se pudo actualizar la hora de salida. Inténtalo de nuevo.',
  },
  fr: {
    title: 'Parcours et disponibilités', subtitle: 'Intégrez le parcours que vous exploitez, puis publiez des départs réservables.',
    step1: '1 · Intégrer un parcours', step2: '2 · Publier les disponibilités',
    onboardPlaceholder: 'Sélectionnez un parcours à intégrer…', onboard: 'INTÉGRER',
    publishLocked: 'Intégrez un parcours ci-dessus pour activer la publication des disponibilités.',
    yourCourse: 'Votre parcours', date: 'Date', time: 'Heure', capacity: 'Capacité', publish: 'PUBLIER',
    invHeader: 'Vos départs publiés', noSlots: 'Aucun départ publié pour le moment.',
    colCourse: 'Parcours', colDate: 'Date', colTime: 'Heure', colBookedCap: 'Réservés / Cap.', colStatus: 'Statut', colAction: 'Action',
    close: 'Fermer', open: 'Ouvrir', stOpen: 'Ouvert', stClosed: 'Fermé',
    selectToOnboard: 'Sélectionnez un parcours à intégrer.', onboardedMsg: '{name} intégré. Vous pouvez maintenant publier ses départs.', onboardFailed: 'Impossible d’intégrer le parcours. Veuillez réessayer.',
    selectCourseFirst: 'Sélectionnez d’abord l’un de vos parcours.', publishedMsg: 'Départ publié {date} {time}.', publishFailed: 'Impossible de publier le départ. Veuillez réessayer.',
    slotOpenedMsg: 'Départ ouvert.', slotClosedMsg: 'Départ fermé.', slotFailed: 'Impossible de mettre à jour le départ. Veuillez réessayer.',
  },
  de: {
    title: 'Platz & Verfügbarkeit', subtitle: 'Binden Sie den von Ihnen betriebenen Platz ein und veröffentlichen Sie dann buchbare Abschlagszeiten.',
    step1: '1 · Platz einbinden', step2: '2 · Verfügbarkeit veröffentlichen',
    onboardPlaceholder: 'Einzubindenden Platz auswählen…', onboard: 'EINBINDEN',
    publishLocked: 'Binden Sie oben einen Platz ein, um die Veröffentlichung der Verfügbarkeit freizuschalten.',
    yourCourse: 'Ihr Platz', date: 'Datum', time: 'Uhrzeit', capacity: 'Kapazität', publish: 'VERÖFFENTLICHEN',
    invHeader: 'Ihre veröffentlichten Abschlagszeiten', noSlots: 'Noch keine Abschlagszeiten veröffentlicht.',
    colCourse: 'Platz', colDate: 'Datum', colTime: 'Uhrzeit', colBookedCap: 'Gebucht / Kap.', colStatus: 'Status', colAction: 'Aktion',
    close: 'Schließen', open: 'Öffnen', stOpen: 'Offen', stClosed: 'Geschlossen',
    selectToOnboard: 'Wählen Sie einen einzubindenden Platz.', onboardedMsg: '{name} eingebunden. Sie können jetzt Abschlagszeiten veröffentlichen.', onboardFailed: 'Der Platz konnte nicht eingebunden werden. Bitte erneut versuchen.',
    selectCourseFirst: 'Wählen Sie zuerst einen Ihrer Plätze.', publishedMsg: 'Abschlagszeit {date} {time} veröffentlicht.', publishFailed: 'Die Abschlagszeit konnte nicht veröffentlicht werden. Bitte erneut versuchen.',
    slotOpenedMsg: 'Abschlagszeit geöffnet.', slotClosedMsg: 'Abschlagszeit geschlossen.', slotFailed: 'Die Abschlagszeit konnte nicht aktualisiert werden. Bitte erneut versuchen.',
  },
};
