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
    const status=await this.loadIngestionOperations(),receipt=status.lastCountReceipt as Record<string,unknown>|undefined;
    return receipt?[{id:String(receipt.receiptId||''),data:receipt}]:[];
  },
  async sync(payload) {
    void payload;throw new Error('COURSE_PROVIDER_OPERATOR_PATH_RETIRED');
  },
  async previewRegion(payload) {
    void payload;throw new Error('COURSE_PROVIDER_OPERATOR_PATH_RETIRED');
  },
  async commitRegion(jobId) {
    void jobId;throw new Error('COURSE_PROVIDER_OPERATOR_PATH_RETIRED');
  },
  async loadIngestionOperations(){const response=await httpsCallable(functions,'getGolfApiCatalogueStatus')();const value=response.data as Record<string,unknown>;if(value?.schema!=='golfriend.course-catalogue-status.v3')throw new Error('COURSE_CATALOGUE_STATUS_INVALID');return value;},
  async prepareFailedRetry(jobId){void jobId;throw new Error('COURSE_PROVIDER_OPERATOR_PATH_RETIRED');},
  async loadAcquisitionDashboard(){return this.loadIngestionOperations();},
  async previewAcquisitionPlan(payload){void payload;throw new Error('COURSE_PROVIDER_OPERATOR_PATH_RETIRED');},
  async decideCandidate(payload){void payload;throw new Error('COURSE_PROVIDER_OPERATOR_PATH_RETIRED');},
  async publishCandidate(payload){void payload;throw new Error('COURSE_PROVIDER_OPERATOR_PATH_RETIRED');},
};
