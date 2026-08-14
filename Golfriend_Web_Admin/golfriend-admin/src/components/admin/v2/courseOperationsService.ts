import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../firebaseConfig';

export interface CourseOperationsService {
  loadCourses(): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  loadGrowthReceipts(): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  sync(payload: { mode: 'preview'|'apply'; courseIds?: string[]; limit?: number }): Promise<unknown>;
  previewRegion(payload: {latitude:number;longitude:number;radiusKm:number}): Promise<Record<string,unknown>>;
  commitRegion(jobId:string): Promise<Record<string,unknown>>;
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
};
