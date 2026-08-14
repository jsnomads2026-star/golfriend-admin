import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../firebaseConfig';

export interface CourseOperationsService {
  loadCourses(): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  loadGrowthReceipts(): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  sync(payload: { mode: 'preview'|'apply'; courseIds?: string[]; limit?: number }): Promise<unknown>;
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
};
