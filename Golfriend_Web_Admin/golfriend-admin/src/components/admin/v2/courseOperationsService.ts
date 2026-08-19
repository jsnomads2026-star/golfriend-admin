import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../firebaseConfig';

export interface CourseOperationsService {
  loadCourses(): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  loadGrowthReceipts(): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  sync(payload: { mode: 'preview'|'apply'; courseIds?: string[]; limit?: number }): Promise<unknown>;
  previewRegion(payload: {latitude:number;longitude:number;radiusKm:number}): Promise<Record<string,unknown>>;
  commitRegion(jobId:string): Promise<Record<string,unknown>>;
  loadIngestionOperations():Promise<Record<string,unknown>>;
  prepareFailedRetry(jobId:string):Promise<Record<string,unknown>>;
  loadAcquisitionDashboard():Promise<Record<string,unknown>>;
  previewAcquisitionPlan(payload:{coverage:unknown[];manual:unknown[]}):Promise<Record<string,unknown>>;
  decideCandidate(payload:{candidateId:string;action:'confirm_new'|'reject';commandId:string}):Promise<Record<string,unknown>>;
  publishCandidate(payload:{candidateId:string;decisionId:string;commandId:string;confirmed:true}):Promise<Record<string,unknown>>;
}

export const courseOperationsService: CourseOperationsService = {
  async loadCourses() {
    const snapshot = await getDocs(collection(db, 'courses'));
    return snapshot.docs.map((item) => ({ id: item.id, data: item.data() }));
  },
  async loadGrowthReceipts() {
    const callable = httpsCallable(functions, 'listCourseSyncReceipts');
    const response = await callable();
    const value = response.data as {schemaVersion?:unknown;receipts?:unknown};
    if (value.schemaVersion !== 'golfriend.course-sync-receipt/v1' || !Array.isArray(value.receipts)) throw new Error('COURSE_RECEIPTS_INVALID');
    return value.receipts.map((item) => {const data=item as Record<string,unknown>;return {id:String(data.receiptId||''),data};});
  },
  async sync(payload) {
    const callable = httpsCallable(functions, 'syncCoursesFromProvider');
    const response = await callable(payload);
    return response.data;
  },
  async previewRegion(payload) {
    const callable=httpsCallable(functions,'previewCourseRegionImport');
    const response=await callable(payload);
    if(!response.data||typeof response.data!=='object'||typeof (response.data as Record<string,unknown>).jobId!=='string') throw new Error('COURSE_INGESTION_PREVIEW_INVALID');
    return response.data as Record<string,unknown>;
  },
  async commitRegion(jobId) {
    if(!jobId.trim()) throw new Error('COURSE_INGESTION_JOB_REQUIRED');
    const callable=httpsCallable(functions,'commitCourseRegionImport');
    const response=await callable({jobId});
    if(!response.data||typeof response.data!=='object') throw new Error('COURSE_INGESTION_COMMIT_INVALID');
    return response.data as Record<string,unknown>;
  },
  async loadIngestionOperations(){const response=await httpsCallable(functions,'getGolfApiCatalogueStatus')();const value=response.data as Record<string,unknown>;if(value?.schema!=='golfriend.course-catalogue-status.v2')throw new Error('COURSE_CATALOGUE_STATUS_INVALID');return value;},
  async prepareFailedRetry(jobId){if(!jobId.trim())throw new Error('COURSE_RETRY_JOB_REQUIRED');const response=await httpsCallable(functions,'prepareCourseIngestionRetry')({jobId});const value=response.data as Record<string,unknown>;if(value?.schemaVersion!=='golfriend.course-ingestion-retry/v1'||typeof value.jobId!=='string')throw new Error('COURSE_RETRY_INVALID');return value;},
  async loadAcquisitionDashboard(){const response=await httpsCallable(functions,'getCourseAcquisitionDashboard')();const value=response.data as Record<string,unknown>;if(value?.schema!=='golfriend.course-acquisition-dashboard.v1')throw new Error('ACQUISITION_DASHBOARD_INVALID');return value;},
  async previewAcquisitionPlan(payload){const response=await httpsCallable(functions,'previewCourseAcquisitionPlan')(payload);const value=response.data as Record<string,unknown>;if(value?.schema!=='golfriend.course-acquisition-plan.v1'||value.providerCalls!==0||value.writes!==0)throw new Error('ACQUISITION_PLAN_INVALID');return value;},
  async decideCandidate(payload){const response=await httpsCallable(functions,'decideCourseCandidate')({...payload,fieldChoices:{}});const value=response.data as Record<string,unknown>;if(value?.schema!=='golfriend.course-review-result.v1')throw new Error('COURSE_REVIEW_INVALID');return value;},
  async publishCandidate(payload){const response=await httpsCallable(functions,'publishCourseCandidate')(payload);const value=response.data as Record<string,unknown>;if(value?.schema!=='golfriend.course-publication-result.v1'||value.state!=='published')throw new Error('COURSE_PUBLICATION_INVALID');return value;},
};
