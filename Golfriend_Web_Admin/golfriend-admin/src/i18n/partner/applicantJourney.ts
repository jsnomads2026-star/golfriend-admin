import {LOCALE_CODES, type CanonicalLocale} from '../locales.ts';

// Copy for the applicant journey itself — the form an applicant actually completes.
//
// The eight locales are the canonical set imported from src/i18n/locales.ts; the record type
// below is exhaustive, so a missing translation is a TypeScript error rather than a silent
// English leak at runtime.
//
// Two rules govern the wording:
//  * nothing here may imply approval, activation, a started trial or Portal access;
//  * no raw provider or server error code is ever shown. Every failure has a stated, human
//    consequence ("nothing was saved") instead of a code.

export const APPLICANT_JOURNEY_LOCALES = LOCALE_CODES;

export interface ApplicantJourneyCopy {
  // Shell
  title: string; lead: string; language: string; signOut: string;
  navApplication: string; navDocuments: string; navAgreement: string; navReview: string; navStatus: string;
  // Generic
  save: string; busy: string; loading: string; loadError: string; offline: string; retry: string;
  none: string; savedNotice: string; locked: string;
  // Organization
  organizationHeading: string; organization: string; organizationType: string; country: string; region: string;
  courseName: string; courseAddress: string; courseWebsite: string;
  legalName: string; registrationId: string; timeZone: string; holes: string;
  catalogueLocales: string; catalogueHint: string;
  // Contact
  contactHeading: string; contactName: string; contactEmail: string; contactPhone: string;
  preferredLanguage: string; consent: string; terms: string;
  // Representative
  representativeHeading: string; representativeLead: string;
  representativeName: string; representativeTitle: string; representativeEmail: string; representativeEmailHint: string;
  representationBasis: string; basisCompany: string; basisSoleProprietor: string; basisAlternative: string;
  authorityConfirm: string; authorityDocument: string;
  // Documents
  documentsHeading: string; documentsLead: string;
  checklistHeading: string; checklistSatisfied: string; checklistMissing: string;
  documentKind: string; uploadDocument: string; storageUnavailable: string;
  statusAwaiting: string; statusVerified: string; statusRejected: string; statusAlternative: string;
  reviewerNote: string; alternativeRequested: string; resubmitLead: string;
  kindCompanyRegistration: string; kindDirectorAuthorization: string; kindBoardResolution: string;
  kindPowerOfAttorney: string; kindSoleProprietorRegistration: string; kindNationalIdentity: string;
  kindApprovedAlternative: string;
  // Agreement
  agreementHeading: string; agreementLead: string; agreementVersionLabel: string; agreementDigestLabel: string;
  clauseScope: string; clauseCommission: string; clauseTrial: string;
  clauseDataProtection: string; clauseTermination: string; clauseGoverningLaw: string;
  legalPending: string; acceptCheckbox: string; acceptButton: string; agreementAccepted: string;
  // Review and submit
  reviewHeading: string; reviewLead: string; submitButton: string; submitBlocked: string;
  // Status
  statusHeading: string; historyHeading: string; messagesHeading: string;
  messageLabel: string; sendMessage: string; materialsHeading: string;
}

const en: ApplicantJourneyCopy = {
  title: 'Golfriend partner application', lead: 'Complete each step. Your draft is saved on the server and you can return to it at any time.',
  language: 'Language', signOut: 'Sign out',
  navApplication: 'Organization', navDocuments: 'Documents', navAgreement: 'Agreement', navReview: 'Review and submit', navStatus: 'Status',
  save: 'Save', busy: 'Working…', loading: 'Loading your application…',
  loadError: 'We could not reach the application service. Nothing was saved or submitted.',
  offline: 'You are offline. Reconnect to save or submit.', retry: 'Try again',
  none: 'Nothing yet.', savedNotice: 'Saved.', locked: 'This application is with Golfriend Admin, so it cannot be edited right now.',
  organizationHeading: 'Organization and course',
  organization: 'Organization name', organizationType: 'Type of organization', country: 'Country code', region: 'Region or province',
  courseName: 'Course or venue name', courseAddress: 'Address', courseWebsite: 'Website',
  legalName: 'Registered legal name', registrationId: 'Company or registration number', timeZone: 'Time zone', holes: 'Holes',
  catalogueLocales: 'Catalogue languages', catalogueHint: 'Golfers see your listing in all eight languages, so all eight are required.',
  contactHeading: 'Contact', contactName: 'Contact name', contactEmail: 'Contact email', contactPhone: 'Contact phone',
  preferredLanguage: 'Preferred language for replies',
  consent: 'I consent to Golfriend reviewing these details and the documents I upload.',
  terms: 'I accept the terms of this application.',
  representativeHeading: 'Authorized representative',
  representativeLead: 'The person who may sign for this organization. Their email must be the verified email you signed in with.',
  representativeName: 'Full name', representativeTitle: 'Position', representativeEmail: 'Email',
  representativeEmailHint: 'Must match your verified sign-in email.',
  representationBasis: 'How you represent this organization',
  basisCompany: 'A registered company', basisSoleProprietor: 'A sole proprietor', basisAlternative: 'An alternative agreed with Golfriend',
  authorityConfirm: 'I confirm I am authorized to represent this organization.',
  authorityDocument: 'Document proving this authority',
  documentsHeading: 'Documents', documentsLead: 'Upload proof of authority. Golfriend Admin reviews each document; you cannot mark your own as verified.',
  checklistHeading: 'What is required', checklistSatisfied: 'Everything required has been verified.',
  checklistMissing: 'Still needed', documentKind: 'Type of document', uploadDocument: 'Upload a document',
  storageUnavailable: 'Secure document storage is not configured, so uploads are closed. Your draft is unaffected.',
  statusAwaiting: 'Awaiting review', statusVerified: 'Verified', statusRejected: 'Not accepted', statusAlternative: 'Alternative requested',
  reviewerNote: 'Reviewer note', alternativeRequested: 'Golfriend Admin has asked for a different document.',
  resubmitLead: 'Upload the replacement here, then submit again.',
  kindCompanyRegistration: 'Company registration certificate', kindDirectorAuthorization: 'Letter of authorization from a director',
  kindBoardResolution: 'Board resolution', kindPowerOfAttorney: 'Power of attorney',
  kindSoleProprietorRegistration: 'Sole proprietor registration', kindNationalIdentity: 'National identity document',
  kindApprovedAlternative: 'Alternative agreed with Golfriend',
  agreementHeading: 'Partner agreement',
  agreementLead: 'This is the exact document you are accepting. The version and fingerprint below are recorded with your acceptance.',
  agreementVersionLabel: 'Version', agreementDigestLabel: 'Document fingerprint',
  clauseScope: 'What the partnership covers', clauseCommission: 'Commission on Golfriend-attributed bookings',
  clauseTrial: 'The 90-day trial', clauseDataProtection: 'Data protection', clauseTermination: 'Ending the agreement',
  clauseGoverningLaw: 'Governing law',
  legalPending: 'The final legal wording is still pending legal approval.',
  acceptCheckbox: 'I have read this agreement and I accept it as the authorized representative.',
  acceptButton: 'Accept this agreement', agreementAccepted: 'Accepted. Your acceptance receipt is recorded.',
  reviewHeading: 'Review and submit', reviewLead: 'Check everything below before you submit. After submitting, the application is locked while Admin reviews it.',
  submitButton: 'Submit for review', submitBlocked: 'Finish the steps above before submitting.',
  statusHeading: 'Application status', historyHeading: 'History', messagesHeading: 'Messages with Golfriend',
  messageLabel: 'Write a message', sendMessage: 'Send', materialsHeading: 'Partner materials',
};

const th: ApplicantJourneyCopy = {
  title: 'ใบสมัครพันธมิตร Golfriend', lead: 'กรอกให้ครบทุกขั้นตอน ระบบบันทึกฉบับร่างไว้บนเซิร์ฟเวอร์ และคุณกลับมาทำต่อได้ทุกเมื่อ',
  language: 'ภาษา', signOut: 'ออกจากระบบ',
  navApplication: 'องค์กร', navDocuments: 'เอกสาร', navAgreement: 'ข้อตกลง', navReview: 'ตรวจทานและส่ง', navStatus: 'สถานะ',
  save: 'บันทึก', busy: 'กำลังดำเนินการ…', loading: 'กำลังโหลดใบสมัคร…',
  loadError: 'ติดต่อระบบใบสมัครไม่ได้ ไม่มีการบันทึกหรือส่งข้อมูลใด ๆ',
  offline: 'คุณออฟไลน์อยู่ เชื่อมต่อใหม่เพื่อบันทึกหรือส่ง', retry: 'ลองอีกครั้ง',
  none: 'ยังไม่มีข้อมูล', savedNotice: 'บันทึกแล้ว', locked: 'ใบสมัครอยู่ระหว่างการตรวจสอบของ Golfriend Admin จึงยังแก้ไขไม่ได้',
  organizationHeading: 'องค์กรและสนาม',
  organization: 'ชื่อองค์กร', organizationType: 'ประเภทองค์กร', country: 'รหัสประเทศ', region: 'จังหวัดหรือภูมิภาค',
  courseName: 'ชื่อสนามหรือสถานที่', courseAddress: 'ที่อยู่', courseWebsite: 'เว็บไซต์',
  legalName: 'ชื่อนิติบุคคลตามทะเบียน', registrationId: 'เลขทะเบียนนิติบุคคล', timeZone: 'เขตเวลา', holes: 'จำนวนหลุม',
  catalogueLocales: 'ภาษาของรายการ', catalogueHint: 'นักกอล์ฟเห็นรายการของคุณครบทั้งแปดภาษา จึงต้องมีครบทั้งแปด',
  contactHeading: 'ผู้ติดต่อ', contactName: 'ชื่อผู้ติดต่อ', contactEmail: 'อีเมลผู้ติดต่อ', contactPhone: 'โทรศัพท์',
  preferredLanguage: 'ภาษาที่ต้องการให้ตอบกลับ',
  consent: 'ข้าพเจ้ายินยอมให้ Golfriend ตรวจสอบข้อมูลและเอกสารที่อัปโหลด',
  terms: 'ข้าพเจ้ายอมรับเงื่อนไขของใบสมัครนี้',
  representativeHeading: 'ผู้มีอำนาจลงนาม',
  representativeLead: 'ผู้ที่ลงนามแทนองค์กรได้ อีเมลต้องตรงกับอีเมลที่ยืนยันแล้วซึ่งใช้เข้าสู่ระบบ',
  representativeName: 'ชื่อ-นามสกุล', representativeTitle: 'ตำแหน่ง', representativeEmail: 'อีเมล',
  representativeEmailHint: 'ต้องตรงกับอีเมลที่ยืนยันแล้วของคุณ',
  representationBasis: 'คุณเป็นตัวแทนองค์กรในฐานะใด',
  basisCompany: 'นิติบุคคลจดทะเบียน', basisSoleProprietor: 'ผู้ประกอบการรายบุคคล', basisAlternative: 'รูปแบบอื่นที่ตกลงกับ Golfriend',
  authorityConfirm: 'ข้าพเจ้ายืนยันว่ามีอำนาจเป็นตัวแทนขององค์กรนี้',
  authorityDocument: 'เอกสารพิสูจน์อำนาจ',
  documentsHeading: 'เอกสาร', documentsLead: 'อัปโหลดหลักฐานแสดงอำนาจ Golfriend Admin เป็นผู้ตรวจสอบทุกฉบับ คุณยืนยันเอกสารของตนเองไม่ได้',
  checklistHeading: 'สิ่งที่ต้องมี', checklistSatisfied: 'ตรวจสอบครบถ้วนแล้ว',
  checklistMissing: 'ยังขาด', documentKind: 'ประเภทเอกสาร', uploadDocument: 'อัปโหลดเอกสาร',
  storageUnavailable: 'ยังไม่ได้ตั้งค่าที่จัดเก็บเอกสารที่ปลอดภัย ระบบจึงปิดการอัปโหลด ฉบับร่างของคุณไม่ได้รับผลกระทบ',
  statusAwaiting: 'รอการตรวจสอบ', statusVerified: 'ตรวจสอบแล้ว', statusRejected: 'ไม่รับเอกสารนี้', statusAlternative: 'ขอเอกสารอื่น',
  reviewerNote: 'หมายเหตุจากผู้ตรวจ', alternativeRequested: 'Golfriend Admin ขอเอกสารฉบับอื่น',
  resubmitLead: 'อัปโหลดเอกสารทดแทนที่นี่ แล้วส่งใหม่อีกครั้ง',
  kindCompanyRegistration: 'หนังสือรับรองการจดทะเบียนนิติบุคคล', kindDirectorAuthorization: 'หนังสือมอบอำนาจจากกรรมการ',
  kindBoardResolution: 'มติคณะกรรมการ', kindPowerOfAttorney: 'หนังสือมอบอำนาจ',
  kindSoleProprietorRegistration: 'ทะเบียนพาณิชย์บุคคลธรรมดา', kindNationalIdentity: 'บัตรประจำตัวประชาชน',
  kindApprovedAlternative: 'เอกสารรูปแบบอื่นที่ตกลงกับ Golfriend',
  agreementHeading: 'ข้อตกลงพันธมิตร',
  agreementLead: 'นี่คือเอกสารฉบับที่คุณกำลังยอมรับ ระบบจะบันทึกเวอร์ชันและลายนิ้วมือดิจิทัลด้านล่างพร้อมการยอมรับของคุณ',
  agreementVersionLabel: 'เวอร์ชัน', agreementDigestLabel: 'ลายนิ้วมือดิจิทัลของเอกสาร',
  clauseScope: 'ขอบเขตความร่วมมือ', clauseCommission: 'ค่าคอมมิชชันจากการจองที่มาจาก Golfriend',
  clauseTrial: 'ช่วงทดลอง 90 วัน', clauseDataProtection: 'การคุ้มครองข้อมูล', clauseTermination: 'การสิ้นสุดข้อตกลง',
  clauseGoverningLaw: 'กฎหมายที่ใช้บังคับ',
  legalPending: 'ถ้อยคำทางกฎหมายฉบับสุดท้ายยังอยู่ระหว่างรอการอนุมัติทางกฎหมาย',
  acceptCheckbox: 'ข้าพเจ้าได้อ่านข้อตกลงนี้แล้ว และยอมรับในฐานะผู้มีอำนาจลงนาม',
  acceptButton: 'ยอมรับข้อตกลงนี้', agreementAccepted: 'ยอมรับแล้ว ระบบบันทึกหลักฐานการยอมรับไว้แล้ว',
  reviewHeading: 'ตรวจทานและส่ง', reviewLead: 'โปรดตรวจสอบข้อมูลทั้งหมดก่อนส่ง หลังส่งแล้วใบสมัครจะถูกล็อกระหว่างที่ Admin ตรวจสอบ',
  submitButton: 'ส่งให้ตรวจสอบ', submitBlocked: 'กรุณาทำขั้นตอนด้านบนให้ครบก่อนส่ง',
  statusHeading: 'สถานะใบสมัคร', historyHeading: 'ประวัติ', messagesHeading: 'ข้อความกับ Golfriend',
  messageLabel: 'เขียนข้อความ', sendMessage: 'ส่ง', materialsHeading: 'สื่อสำหรับพันธมิตร',
};

const ko: ApplicantJourneyCopy = {
  title: 'Golfriend 파트너 신청', lead: '각 단계를 완료하세요. 초안은 서버에 저장되며 언제든 이어서 작성할 수 있습니다.',
  language: '언어', signOut: '로그아웃',
  navApplication: '조직', navDocuments: '서류', navAgreement: '계약서', navReview: '검토 후 제출', navStatus: '상태',
  save: '저장', busy: '처리 중…', loading: '신청서를 불러오는 중…',
  loadError: '신청 서비스에 연결하지 못했습니다. 저장되거나 제출된 것은 없습니다.',
  offline: '오프라인입니다. 저장하거나 제출하려면 다시 연결하세요.', retry: '다시 시도',
  none: '아직 없습니다.', savedNotice: '저장되었습니다.', locked: '이 신청서는 현재 Golfriend Admin이 검토 중이라 수정할 수 없습니다.',
  organizationHeading: '조직 및 골프장',
  organization: '조직명', organizationType: '조직 유형', country: '국가 코드', region: '지역 또는 도',
  courseName: '골프장 또는 시설명', courseAddress: '주소', courseWebsite: '웹사이트',
  legalName: '등기 법인명', registrationId: '사업자 또는 법인 등록번호', timeZone: '시간대', holes: '홀 수',
  catalogueLocales: '카탈로그 언어', catalogueHint: '골퍼는 여덟 개 언어 모두에서 귀사의 정보를 보므로 여덟 개 모두 필요합니다.',
  contactHeading: '연락처', contactName: '담당자 이름', contactEmail: '담당자 이메일', contactPhone: '전화번호',
  preferredLanguage: '회신 받을 언어',
  consent: 'Golfriend가 이 정보와 업로드한 서류를 검토하는 데 동의합니다.',
  terms: '이 신청의 약관에 동의합니다.',
  representativeHeading: '위임받은 대표자',
  representativeLead: '이 조직을 대표해 서명할 수 있는 사람입니다. 이메일은 로그인에 사용한 인증된 이메일과 같아야 합니다.',
  representativeName: '성명', representativeTitle: '직책', representativeEmail: '이메일',
  representativeEmailHint: '인증된 로그인 이메일과 일치해야 합니다.',
  representationBasis: '이 조직을 대표하는 근거',
  basisCompany: '등록된 법인', basisSoleProprietor: '개인사업자', basisAlternative: 'Golfriend와 합의한 대체 방식',
  authorityConfirm: '본인은 이 조직을 대표할 권한이 있음을 확인합니다.',
  authorityDocument: '권한을 증명하는 서류',
  documentsHeading: '서류', documentsLead: '권한 증빙을 업로드하세요. Golfriend Admin이 각 서류를 검토하며, 본인이 직접 인증할 수 없습니다.',
  checklistHeading: '필요한 서류', checklistSatisfied: '필요한 서류가 모두 인증되었습니다.',
  checklistMissing: '아직 필요함', documentKind: '서류 종류', uploadDocument: '서류 업로드',
  storageUnavailable: '안전한 서류 보관소가 설정되지 않아 업로드가 닫혀 있습니다. 초안에는 영향이 없습니다.',
  statusAwaiting: '검토 대기', statusVerified: '인증됨', statusRejected: '반려됨', statusAlternative: '대체 서류 요청',
  reviewerNote: '검토자 메모', alternativeRequested: 'Golfriend Admin이 다른 서류를 요청했습니다.',
  resubmitLead: '대체 서류를 여기에 업로드한 뒤 다시 제출하세요.',
  kindCompanyRegistration: '법인 등기부 등본', kindDirectorAuthorization: '이사의 위임장',
  kindBoardResolution: '이사회 결의서', kindPowerOfAttorney: '위임장',
  kindSoleProprietorRegistration: '개인사업자 등록증', kindNationalIdentity: '신분증',
  kindApprovedAlternative: 'Golfriend와 합의한 대체 서류',
  agreementHeading: '파트너 계약서',
  agreementLead: '귀하가 수락하는 정확한 문서입니다. 아래 버전과 지문이 수락과 함께 기록됩니다.',
  agreementVersionLabel: '버전', agreementDigestLabel: '문서 지문',
  clauseScope: '파트너십의 범위', clauseCommission: 'Golfriend 경유 예약 수수료',
  clauseTrial: '90일 체험', clauseDataProtection: '개인정보 보호', clauseTermination: '계약 종료',
  clauseGoverningLaw: '준거법',
  legalPending: '최종 법률 문구는 아직 법무 승인 대기 중입니다.',
  acceptCheckbox: '이 계약서를 읽었으며 위임받은 대표자로서 수락합니다.',
  acceptButton: '이 계약서 수락', agreementAccepted: '수락되었습니다. 수락 영수증이 기록되었습니다.',
  reviewHeading: '검토 후 제출', reviewLead: '제출 전에 아래 내용을 확인하세요. 제출하면 Admin 검토 동안 신청서가 잠깁니다.',
  submitButton: '검토 요청', submitBlocked: '제출하기 전에 위 단계를 완료하세요.',
  statusHeading: '신청 상태', historyHeading: '이력', messagesHeading: 'Golfriend와의 메시지',
  messageLabel: '메시지 작성', sendMessage: '보내기', materialsHeading: '파트너 자료',
};

const ja: ApplicantJourneyCopy = {
  title: 'Golfriend パートナー申請', lead: '各ステップを入力してください。下書きはサーバーに保存され、いつでも再開できます。',
  language: '言語', signOut: 'サインアウト',
  navApplication: '組織', navDocuments: '書類', navAgreement: '契約', navReview: '確認して送信', navStatus: 'ステータス',
  save: '保存', busy: '処理中…', loading: '申請を読み込み中…',
  loadError: '申請サービスに接続できませんでした。保存も送信もされていません。',
  offline: 'オフラインです。保存または送信するには再接続してください。', retry: '再試行',
  none: 'まだありません。', savedNotice: '保存しました。', locked: 'この申請は Golfriend Admin が審査中のため、現在は編集できません。',
  organizationHeading: '組織とコース',
  organization: '組織名', organizationType: '組織の種類', country: '国コード', region: '地域・都道府県',
  courseName: 'コース／施設名', courseAddress: '住所', courseWebsite: 'ウェブサイト',
  legalName: '登記上の法人名', registrationId: '法人番号・登録番号', timeZone: 'タイムゾーン', holes: 'ホール数',
  catalogueLocales: 'カタログの言語', catalogueHint: 'ゴルファーには八言語すべてで掲載されるため、八言語すべてが必要です。',
  contactHeading: '連絡先', contactName: '担当者名', contactEmail: '担当者メール', contactPhone: '電話番号',
  preferredLanguage: '返信を希望する言語',
  consent: 'Golfriend がこの内容とアップロードした書類を確認することに同意します。',
  terms: 'この申請の条件に同意します。',
  representativeHeading: '正当な代表者',
  representativeLead: 'この組織を代表して署名できる方です。メールはサインインに使用した確認済みメールと一致する必要があります。',
  representativeName: '氏名', representativeTitle: '役職', representativeEmail: 'メール',
  representativeEmailHint: '確認済みのサインインメールと一致している必要があります。',
  representationBasis: 'この組織を代表する立場',
  basisCompany: '登記された法人', basisSoleProprietor: '個人事業主', basisAlternative: 'Golfriend と合意した代替手段',
  authorityConfirm: '私はこの組織を代表する権限があることを確認します。',
  authorityDocument: '権限を証明する書類',
  documentsHeading: '書類', documentsLead: '権限を証明する書類をアップロードしてください。Golfriend Admin が各書類を確認します。ご自身で確認済みにすることはできません。',
  checklistHeading: '必要なもの', checklistSatisfied: '必要な書類はすべて確認されました。',
  checklistMissing: 'まだ必要', documentKind: '書類の種類', uploadDocument: '書類をアップロード',
  storageUnavailable: '安全な書類保管が未設定のため、アップロードは停止しています。下書きに影響はありません。',
  statusAwaiting: '確認待ち', statusVerified: '確認済み', statusRejected: '受理されず', statusAlternative: '代替書類の依頼',
  reviewerNote: '確認者メモ', alternativeRequested: 'Golfriend Admin が別の書類を求めています。',
  resubmitLead: '差し替えをここにアップロードし、もう一度送信してください。',
  kindCompanyRegistration: '登記事項証明書', kindDirectorAuthorization: '取締役による委任状',
  kindBoardResolution: '取締役会決議書', kindPowerOfAttorney: '委任状',
  kindSoleProprietorRegistration: '個人事業の開業届', kindNationalIdentity: '本人確認書類',
  kindApprovedAlternative: 'Golfriend と合意した代替書類',
  agreementHeading: 'パートナー契約',
  agreementLead: 'これが承諾いただく正確な文書です。以下のバージョンとフィンガープリントが承諾とともに記録されます。',
  agreementVersionLabel: 'バージョン', agreementDigestLabel: '文書のフィンガープリント',
  clauseScope: 'パートナーシップの範囲', clauseCommission: 'Golfriend 経由の予約に対する手数料',
  clauseTrial: '90日間のトライアル', clauseDataProtection: 'データ保護', clauseTermination: '契約の終了',
  clauseGoverningLaw: '準拠法',
  legalPending: '最終的な法的文言は法務承認待ちです。',
  acceptCheckbox: 'この契約を読み、正当な代表者として承諾します。',
  acceptButton: 'この契約を承諾する', agreementAccepted: '承諾されました。承諾の受領記録が保存されています。',
  reviewHeading: '確認して送信', reviewLead: '送信前に以下をご確認ください。送信後は Admin の審査中、申請はロックされます。',
  submitButton: '審査に提出', submitBlocked: '送信する前に上のステップを完了してください。',
  statusHeading: '申請ステータス', historyHeading: '履歴', messagesHeading: 'Golfriend とのやり取り',
  messageLabel: 'メッセージを書く', sendMessage: '送信', materialsHeading: 'パートナー資料',
};

const zh: ApplicantJourneyCopy = {
  title: 'Golfriend 合作伙伴申请', lead: '请完成每个步骤。草稿保存在服务器上，你可以随时回来继续。',
  language: '语言', signOut: '退出登录',
  navApplication: '机构', navDocuments: '文件', navAgreement: '协议', navReview: '复核并提交', navStatus: '状态',
  save: '保存', busy: '处理中…', loading: '正在加载你的申请…',
  loadError: '无法连接申请服务。没有保存或提交任何内容。',
  offline: '你当前离线。请重新连接后保存或提交。', retry: '重试',
  none: '暂无内容。', savedNotice: '已保存。', locked: '该申请正在 Golfriend Admin 审核中，暂时无法编辑。',
  organizationHeading: '机构与球场',
  organization: '机构名称', organizationType: '机构类型', country: '国家代码', region: '地区或省份',
  courseName: '球场或场地名称', courseAddress: '地址', courseWebsite: '网站',
  legalName: '注册法定名称', registrationId: '公司或注册编号', timeZone: '时区', holes: '球洞数',
  catalogueLocales: '目录语言', catalogueHint: '球手会以全部八种语言看到你的信息，因此八种语言都需要填写。',
  contactHeading: '联系人', contactName: '联系人姓名', contactEmail: '联系人邮箱', contactPhone: '联系电话',
  preferredLanguage: '希望使用的回复语言',
  consent: '我同意 Golfriend 审核这些资料以及我上传的文件。',
  terms: '我接受本次申请的条款。',
  representativeHeading: '授权代表',
  representativeLead: '可代表该机构签署的人。其邮箱必须与你登录时验证过的邮箱一致。',
  representativeName: '姓名', representativeTitle: '职位', representativeEmail: '邮箱',
  representativeEmailHint: '必须与你已验证的登录邮箱一致。',
  representationBasis: '你以何种身份代表该机构',
  basisCompany: '已注册公司', basisSoleProprietor: '个体经营者', basisAlternative: '与 Golfriend 约定的其他方式',
  authorityConfirm: '我确认本人有权代表该机构。',
  authorityDocument: '证明该授权的文件',
  documentsHeading: '文件', documentsLead: '请上传授权证明。每份文件由 Golfriend Admin 审核，你无法自行标记为已核验。',
  checklistHeading: '所需文件', checklistSatisfied: '所需文件均已核验。',
  checklistMissing: '仍需提供', documentKind: '文件类型', uploadDocument: '上传文件',
  storageUnavailable: '尚未配置安全的文件存储，上传已关闭。你的草稿不受影响。',
  statusAwaiting: '等待审核', statusVerified: '已核验', statusRejected: '未获接受', statusAlternative: '已要求替代文件',
  reviewerNote: '审核备注', alternativeRequested: 'Golfriend Admin 要求提供另一份文件。',
  resubmitLead: '请在此上传替代文件，然后重新提交。',
  kindCompanyRegistration: '公司注册证明', kindDirectorAuthorization: '董事出具的授权书',
  kindBoardResolution: '董事会决议', kindPowerOfAttorney: '授权委托书',
  kindSoleProprietorRegistration: '个体工商户登记证', kindNationalIdentity: '身份证件',
  kindApprovedAlternative: '与 Golfriend 约定的替代文件',
  agreementHeading: '合作伙伴协议',
  agreementLead: '这是你正在接受的确切文本。下方的版本与文件指纹会与你的接受一并记录。',
  agreementVersionLabel: '版本', agreementDigestLabel: '文件指纹',
  clauseScope: '合作范围', clauseCommission: '来自 Golfriend 的预订佣金',
  clauseTrial: '90 天试用', clauseDataProtection: '数据保护', clauseTermination: '协议终止',
  clauseGoverningLaw: '适用法律',
  legalPending: '最终法律文本仍在等待法务批准。',
  acceptCheckbox: '我已阅读本协议，并以授权代表身份接受。',
  acceptButton: '接受本协议', agreementAccepted: '已接受。你的接受回执已记录。',
  reviewHeading: '复核并提交', reviewLead: '提交前请检查以下内容。提交后，申请将在 Admin 审核期间锁定。',
  submitButton: '提交审核', submitBlocked: '请先完成上面的步骤再提交。',
  statusHeading: '申请状态', historyHeading: '历史记录', messagesHeading: '与 Golfriend 的消息',
  messageLabel: '写一条消息', sendMessage: '发送', materialsHeading: '合作伙伴素材',
};

const es: ApplicantJourneyCopy = {
  title: 'Solicitud de socio Golfriend', lead: 'Completa cada paso. Tu borrador se guarda en el servidor y puedes retomarlo cuando quieras.',
  language: 'Idioma', signOut: 'Cerrar sesión',
  navApplication: 'Organización', navDocuments: 'Documentos', navAgreement: 'Acuerdo', navReview: 'Revisar y enviar', navStatus: 'Estado',
  save: 'Guardar', busy: 'Procesando…', loading: 'Cargando tu solicitud…',
  loadError: 'No pudimos contactar con el servicio de solicitudes. No se guardó ni se envió nada.',
  offline: 'Estás sin conexión. Reconéctate para guardar o enviar.', retry: 'Reintentar',
  none: 'Todavía nada.', savedNotice: 'Guardado.', locked: 'Esta solicitud está en revisión por Golfriend Admin, así que no se puede editar ahora.',
  organizationHeading: 'Organización y campo',
  organization: 'Nombre de la organización', organizationType: 'Tipo de organización', country: 'Código de país', region: 'Región o provincia',
  courseName: 'Nombre del campo o local', courseAddress: 'Dirección', courseWebsite: 'Sitio web',
  legalName: 'Razón social registrada', registrationId: 'Número de registro mercantil', timeZone: 'Zona horaria', holes: 'Hoyos',
  catalogueLocales: 'Idiomas del catálogo', catalogueHint: 'Los golfistas ven tu ficha en los ocho idiomas, así que se requieren los ocho.',
  contactHeading: 'Contacto', contactName: 'Nombre de contacto', contactEmail: 'Correo de contacto', contactPhone: 'Teléfono',
  preferredLanguage: 'Idioma preferido para las respuestas',
  consent: 'Doy mi consentimiento para que Golfriend revise estos datos y los documentos que suba.',
  terms: 'Acepto las condiciones de esta solicitud.',
  representativeHeading: 'Representante autorizado',
  representativeLead: 'La persona que puede firmar por esta organización. Su correo debe ser el correo verificado con el que iniciaste sesión.',
  representativeName: 'Nombre completo', representativeTitle: 'Cargo', representativeEmail: 'Correo electrónico',
  representativeEmailHint: 'Debe coincidir con tu correo verificado de acceso.',
  representationBasis: 'Cómo representas a esta organización',
  basisCompany: 'Una empresa registrada', basisSoleProprietor: 'Un autónomo', basisAlternative: 'Una alternativa acordada con Golfriend',
  authorityConfirm: 'Confirmo que estoy autorizado para representar a esta organización.',
  authorityDocument: 'Documento que acredita esa autoridad',
  documentsHeading: 'Documentos', documentsLead: 'Sube la prueba de autoridad. Golfriend Admin revisa cada documento; no puedes marcar el tuyo como verificado.',
  checklistHeading: 'Qué se necesita', checklistSatisfied: 'Todo lo necesario está verificado.',
  checklistMissing: 'Falta todavía', documentKind: 'Tipo de documento', uploadDocument: 'Subir un documento',
  storageUnavailable: 'El almacenamiento seguro de documentos no está configurado, así que las subidas están cerradas. Tu borrador no se ve afectado.',
  statusAwaiting: 'Pendiente de revisión', statusVerified: 'Verificado', statusRejected: 'No aceptado', statusAlternative: 'Alternativa solicitada',
  reviewerNote: 'Nota del revisor', alternativeRequested: 'Golfriend Admin ha pedido un documento distinto.',
  resubmitLead: 'Sube aquí el sustituto y vuelve a enviar.',
  kindCompanyRegistration: 'Certificado de registro mercantil', kindDirectorAuthorization: 'Carta de autorización de un administrador',
  kindBoardResolution: 'Acuerdo del consejo', kindPowerOfAttorney: 'Poder notarial',
  kindSoleProprietorRegistration: 'Alta de autónomo', kindNationalIdentity: 'Documento nacional de identidad',
  kindApprovedAlternative: 'Alternativa acordada con Golfriend',
  agreementHeading: 'Acuerdo de socio',
  agreementLead: 'Este es el documento exacto que aceptas. La versión y la huella de abajo se registran junto con tu aceptación.',
  agreementVersionLabel: 'Versión', agreementDigestLabel: 'Huella del documento',
  clauseScope: 'Qué cubre la colaboración', clauseCommission: 'Comisión sobre reservas atribuidas a Golfriend',
  clauseTrial: 'La prueba de 90 días', clauseDataProtection: 'Protección de datos', clauseTermination: 'Fin del acuerdo',
  clauseGoverningLaw: 'Ley aplicable',
  legalPending: 'El texto legal definitivo sigue pendiente de aprobación legal.',
  acceptCheckbox: 'He leído este acuerdo y lo acepto como representante autorizado.',
  acceptButton: 'Aceptar este acuerdo', agreementAccepted: 'Aceptado. Tu recibo de aceptación queda registrado.',
  reviewHeading: 'Revisar y enviar', reviewLead: 'Comprueba todo lo siguiente antes de enviar. Tras el envío, la solicitud queda bloqueada durante la revisión.',
  submitButton: 'Enviar a revisión', submitBlocked: 'Completa los pasos anteriores antes de enviar.',
  statusHeading: 'Estado de la solicitud', historyHeading: 'Historial', messagesHeading: 'Mensajes con Golfriend',
  messageLabel: 'Escribe un mensaje', sendMessage: 'Enviar', materialsHeading: 'Materiales para socios',
};

const fr: ApplicantJourneyCopy = {
  title: 'Candidature partenaire Golfriend', lead: 'Complétez chaque étape. Votre brouillon est enregistré sur le serveur et vous pouvez y revenir à tout moment.',
  language: 'Langue', signOut: 'Se déconnecter',
  navApplication: 'Organisation', navDocuments: 'Documents', navAgreement: 'Accord', navReview: 'Vérifier et envoyer', navStatus: 'Statut',
  save: 'Enregistrer', busy: 'Traitement…', loading: 'Chargement de votre candidature…',
  loadError: "Le service de candidature est injoignable. Rien n'a été enregistré ni envoyé.",
  offline: 'Vous êtes hors ligne. Reconnectez-vous pour enregistrer ou envoyer.', retry: 'Réessayer',
  none: 'Rien pour le moment.', savedNotice: 'Enregistré.', locked: "Cette candidature est en cours d'examen par Golfriend Admin et ne peut pas être modifiée pour l'instant.",
  organizationHeading: 'Organisation et parcours',
  organization: "Nom de l'organisation", organizationType: "Type d'organisation", country: 'Code pays', region: 'Région ou province',
  courseName: 'Nom du parcours ou du site', courseAddress: 'Adresse', courseWebsite: 'Site web',
  legalName: 'Raison sociale enregistrée', registrationId: "Numéro d'immatriculation", timeZone: 'Fuseau horaire', holes: 'Trous',
  catalogueLocales: 'Langues du catalogue', catalogueHint: 'Les golfeurs voient votre fiche dans les huit langues : les huit sont donc requises.',
  contactHeading: 'Contact', contactName: 'Nom du contact', contactEmail: 'E-mail du contact', contactPhone: 'Téléphone',
  preferredLanguage: 'Langue souhaitée pour les réponses',
  consent: "J'autorise Golfriend à examiner ces informations et les documents que je dépose.",
  terms: "J'accepte les conditions de cette candidature.",
  representativeHeading: 'Représentant habilité',
  representativeLead: "La personne habilitée à signer pour cette organisation. Son e-mail doit être l'e-mail vérifié utilisé pour la connexion.",
  representativeName: 'Nom complet', representativeTitle: 'Fonction', representativeEmail: 'E-mail',
  representativeEmailHint: "Doit correspondre à votre e-mail de connexion vérifié.",
  representationBasis: 'À quel titre représentez-vous cette organisation',
  basisCompany: 'Une société immatriculée', basisSoleProprietor: 'Un entrepreneur individuel', basisAlternative: 'Une alternative convenue avec Golfriend',
  authorityConfirm: 'Je confirme être habilité à représenter cette organisation.',
  authorityDocument: 'Document prouvant cette habilitation',
  documentsHeading: 'Documents', documentsLead: "Déposez la preuve d'habilitation. Golfriend Admin examine chaque document ; vous ne pouvez pas valider le vôtre.",
  checklistHeading: 'Ce qui est requis', checklistSatisfied: 'Tout ce qui est requis a été vérifié.',
  checklistMissing: 'Encore nécessaire', documentKind: 'Type de document', uploadDocument: 'Déposer un document',
  storageUnavailable: "Le stockage sécurisé des documents n'est pas configuré : les dépôts sont fermés. Votre brouillon n'est pas affecté.",
  statusAwaiting: 'En attente de vérification', statusVerified: 'Vérifié', statusRejected: 'Non accepté', statusAlternative: 'Alternative demandée',
  reviewerNote: 'Note du vérificateur', alternativeRequested: 'Golfriend Admin demande un autre document.',
  resubmitLead: 'Déposez ici le document de remplacement, puis renvoyez la candidature.',
  kindCompanyRegistration: "Extrait d'immatriculation de la société", kindDirectorAuthorization: "Lettre d'habilitation d'un dirigeant",
  kindBoardResolution: 'Décision du conseil', kindPowerOfAttorney: 'Procuration',
  kindSoleProprietorRegistration: "Immatriculation d'entrepreneur individuel", kindNationalIdentity: "Pièce d'identité nationale",
  kindApprovedAlternative: 'Alternative convenue avec Golfriend',
  agreementHeading: 'Accord de partenariat',
  agreementLead: "Voici le document exact que vous acceptez. La version et l'empreinte ci-dessous sont enregistrées avec votre acceptation.",
  agreementVersionLabel: 'Version', agreementDigestLabel: 'Empreinte du document',
  clauseScope: 'Ce que couvre le partenariat', clauseCommission: 'Commission sur les réservations attribuées à Golfriend',
  clauseTrial: "La période d'essai de 90 jours", clauseDataProtection: 'Protection des données', clauseTermination: "Fin de l'accord",
  clauseGoverningLaw: 'Droit applicable',
  legalPending: "Le texte juridique définitif est encore en attente d'approbation juridique.",
  acceptCheckbox: "J'ai lu cet accord et je l'accepte en tant que représentant habilité.",
  acceptButton: 'Accepter cet accord', agreementAccepted: 'Accepté. Votre reçu d’acceptation est enregistré.',
  reviewHeading: 'Vérifier et envoyer', reviewLead: "Vérifiez tout ce qui suit avant d'envoyer. Après envoi, la candidature est verrouillée pendant l'examen.",
  submitButton: 'Envoyer pour examen', submitBlocked: "Terminez les étapes ci-dessus avant d'envoyer.",
  statusHeading: 'Statut de la candidature', historyHeading: 'Historique', messagesHeading: 'Messages avec Golfriend',
  messageLabel: 'Écrire un message', sendMessage: 'Envoyer', materialsHeading: 'Supports partenaires',
};

const de: ApplicantJourneyCopy = {
  title: 'Golfriend-Partnerbewerbung', lead: 'Füllen Sie jeden Schritt aus. Ihr Entwurf wird auf dem Server gespeichert und Sie können jederzeit zurückkehren.',
  language: 'Sprache', signOut: 'Abmelden',
  navApplication: 'Organisation', navDocuments: 'Dokumente', navAgreement: 'Vereinbarung', navReview: 'Prüfen und senden', navStatus: 'Status',
  save: 'Speichern', busy: 'Wird ausgeführt…', loading: 'Ihre Bewerbung wird geladen…',
  loadError: 'Der Bewerbungsdienst war nicht erreichbar. Es wurde nichts gespeichert oder gesendet.',
  offline: 'Sie sind offline. Stellen Sie die Verbindung wieder her, um zu speichern oder zu senden.', retry: 'Erneut versuchen',
  none: 'Noch nichts.', savedNotice: 'Gespeichert.', locked: 'Diese Bewerbung wird gerade von Golfriend Admin geprüft und kann derzeit nicht bearbeitet werden.',
  organizationHeading: 'Organisation und Platz',
  organization: 'Name der Organisation', organizationType: 'Art der Organisation', country: 'Ländercode', region: 'Region oder Provinz',
  courseName: 'Name des Platzes oder Standorts', courseAddress: 'Adresse', courseWebsite: 'Website',
  legalName: 'Eingetragener Firmenname', registrationId: 'Handelsregister- oder Registriernummer', timeZone: 'Zeitzone', holes: 'Löcher',
  catalogueLocales: 'Katalogsprachen', catalogueHint: 'Golfer sehen Ihren Eintrag in allen acht Sprachen, deshalb werden alle acht benötigt.',
  contactHeading: 'Kontakt', contactName: 'Name der Kontaktperson', contactEmail: 'Kontakt-E-Mail', contactPhone: 'Telefon',
  preferredLanguage: 'Bevorzugte Sprache für Antworten',
  consent: 'Ich bin damit einverstanden, dass Golfriend diese Angaben und die hochgeladenen Dokumente prüft.',
  terms: 'Ich akzeptiere die Bedingungen dieser Bewerbung.',
  representativeHeading: 'Bevollmächtigte Person',
  representativeLead: 'Die Person, die für diese Organisation unterzeichnen darf. Ihre E-Mail muss die bestätigte Anmelde-E-Mail sein.',
  representativeName: 'Vollständiger Name', representativeTitle: 'Position', representativeEmail: 'E-Mail',
  representativeEmailHint: 'Muss mit Ihrer bestätigten Anmelde-E-Mail übereinstimmen.',
  representationBasis: 'In welcher Eigenschaft vertreten Sie diese Organisation',
  basisCompany: 'Eine eingetragene Gesellschaft', basisSoleProprietor: 'Ein Einzelunternehmen', basisAlternative: 'Eine mit Golfriend vereinbarte Alternative',
  authorityConfirm: 'Ich bestätige, dass ich zur Vertretung dieser Organisation befugt bin.',
  authorityDocument: 'Dokument als Nachweis dieser Befugnis',
  documentsHeading: 'Dokumente', documentsLead: 'Laden Sie den Vertretungsnachweis hoch. Golfriend Admin prüft jedes Dokument; Sie können Ihr eigenes nicht als geprüft markieren.',
  checklistHeading: 'Was benötigt wird', checklistSatisfied: 'Alles Erforderliche wurde geprüft.',
  checklistMissing: 'Noch erforderlich', documentKind: 'Art des Dokuments', uploadDocument: 'Dokument hochladen',
  storageUnavailable: 'Die sichere Dokumentenablage ist nicht eingerichtet, daher sind Uploads geschlossen. Ihr Entwurf bleibt unberührt.',
  statusAwaiting: 'Wartet auf Prüfung', statusVerified: 'Geprüft', statusRejected: 'Nicht angenommen', statusAlternative: 'Alternative angefordert',
  reviewerNote: 'Anmerkung der Prüfung', alternativeRequested: 'Golfriend Admin hat ein anderes Dokument angefordert.',
  resubmitLead: 'Laden Sie den Ersatz hier hoch und senden Sie erneut.',
  kindCompanyRegistration: 'Handelsregisterauszug', kindDirectorAuthorization: 'Vollmacht eines Geschäftsführers',
  kindBoardResolution: 'Beschluss des Vorstands', kindPowerOfAttorney: 'Vollmacht',
  kindSoleProprietorRegistration: 'Gewerbeanmeldung', kindNationalIdentity: 'Amtlicher Ausweis',
  kindApprovedAlternative: 'Mit Golfriend vereinbarte Alternative',
  agreementHeading: 'Partnervereinbarung',
  agreementLead: 'Dies ist genau das Dokument, das Sie annehmen. Version und Fingerabdruck unten werden mit Ihrer Annahme aufgezeichnet.',
  agreementVersionLabel: 'Version', agreementDigestLabel: 'Fingerabdruck des Dokuments',
  clauseScope: 'Was die Partnerschaft umfasst', clauseCommission: 'Provision auf Golfriend zugeordnete Buchungen',
  clauseTrial: 'Die 90-tägige Testphase', clauseDataProtection: 'Datenschutz', clauseTermination: 'Beendigung der Vereinbarung',
  clauseGoverningLaw: 'Anwendbares Recht',
  legalPending: 'Der endgültige Rechtstext steht noch unter juristischem Genehmigungsvorbehalt.',
  acceptCheckbox: 'Ich habe diese Vereinbarung gelesen und nehme sie als bevollmächtigte Person an.',
  acceptButton: 'Diese Vereinbarung annehmen', agreementAccepted: 'Angenommen. Ihr Annahmebeleg ist aufgezeichnet.',
  reviewHeading: 'Prüfen und senden', reviewLead: 'Prüfen Sie alles Folgende vor dem Senden. Nach dem Senden ist die Bewerbung während der Prüfung gesperrt.',
  submitButton: 'Zur Prüfung senden', submitBlocked: 'Schließen Sie die Schritte oben ab, bevor Sie senden.',
  statusHeading: 'Status der Bewerbung', historyHeading: 'Verlauf', messagesHeading: 'Nachrichten mit Golfriend',
  messageLabel: 'Nachricht schreiben', sendMessage: 'Senden', materialsHeading: 'Partnermaterialien',
};

export const APPLICANT_JOURNEY_COPY: Record<CanonicalLocale, ApplicantJourneyCopy> = {en, th, ko, ja, zh, es, fr, de};

export const applicantJourneyCopy = (locale: string): ApplicantJourneyCopy =>
  APPLICANT_JOURNEY_COPY[(APPLICANT_JOURNEY_LOCALES as readonly string[]).includes(locale) ? (locale as CanonicalLocale) : 'en'];

/** Document kinds, in the order the checklist presents them. Mirrors EVIDENCE_KINDS on the server. */
export const EVIDENCE_KIND_KEYS = [
  'company_registration', 'director_authorization', 'board_resolution', 'power_of_attorney',
  'sole_proprietor_registration', 'national_identity', 'approved_alternative',
] as const;
export type EvidenceKindKey = typeof EVIDENCE_KIND_KEYS[number];

const KIND_COPY_KEY: Record<EvidenceKindKey, keyof ApplicantJourneyCopy> = {
  company_registration: 'kindCompanyRegistration',
  director_authorization: 'kindDirectorAuthorization',
  board_resolution: 'kindBoardResolution',
  power_of_attorney: 'kindPowerOfAttorney',
  sole_proprietor_registration: 'kindSoleProprietorRegistration',
  national_identity: 'kindNationalIdentity',
  approved_alternative: 'kindApprovedAlternative',
};

/** Human name for a document kind. Unknown kinds render their key, never a blank cell. */
export const evidenceKindLabel = (copy: ApplicantJourneyCopy, kind: string): string =>
  KIND_COPY_KEY[kind as EvidenceKindKey] ? copy[KIND_COPY_KEY[kind as EvidenceKindKey]] : kind;

/** Human name for a server verification status. Never shows the raw status token alone. */
export const documentStatusLabel = (copy: ApplicantJourneyCopy, status: string): string =>
  status === 'verified' ? copy.statusVerified
    : status === 'rejected' ? copy.statusRejected
      : status === 'alternative_requested' ? copy.statusAlternative
        : copy.statusAwaiting;
