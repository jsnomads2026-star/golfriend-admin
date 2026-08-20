import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../firebaseConfig';

export interface CourseOperationsService {
  loadCourses(): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  sync(payload: { mode: 'preview'; courseIds: string[] } | { mode: 'apply'; courseIds: string[]; requestId: string }): Promise<unknown>;
  loadIngestionStatus(): Promise<unknown>;
}

export const courseOperationsService: CourseOperationsService = {
  async loadCourses() {
    const snapshot = await getDocs(collection(db, 'courses'));
    return snapshot.docs.map((item) => ({ id: item.id, data: item.data() }));
  },
  async sync(payload) {
    const callable = httpsCallable(functions, 'syncCoursesFromProvider');
    const response = await callable(payload);
    return response.data;
  },
  async loadIngestionStatus() {
    const callable = httpsCallable(functions, 'getGolfApiSyncStatus');
    return (await callable()).data;
  },
};
