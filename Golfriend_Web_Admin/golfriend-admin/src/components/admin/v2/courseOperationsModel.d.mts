export type CourseHealth = 'healthy'|'missing_coordinates'|'incomplete'|'stale'|'duplicate';
export interface CourseView { id:string; canonicalId:string; name:string; country:string; region:string; latitude:number|null; longitude:number|null; hasCoordinates:boolean; source:string; incomplete:boolean; stale:boolean; duplicateKey:string; duplicate:boolean; updatedAt:string|null; lastSyncAt:string|null; contact:string|null; booking:string|null; manualLocked:boolean; requiresManualGPS:boolean }
export function normalizeCourse(id:string, record:Record<string,unknown>, now?:Date): Omit<CourseView,'duplicate'>;
export function markDuplicates(courses:Array<Omit<CourseView,'duplicate'>>): CourseView[];
export function healthOf(course:CourseView): CourseHealth;
export function summarizeCourses(courses:CourseView[]): {total:number;regions:number;withCoordinates:number;missingCoordinates:number;incomplete:number;stale:number;quality:number;duplicates:number;lastSuccessfulSync:string|null};
export function filterCourses(courses:CourseView[], query:string, filter:'all'|CourseHealth):CourseView[];
export function normalizeSyncResult(data:unknown): {mode:'preview';processed:number;productionWrites:0;summary:Record<string,number>;results:Array<{courseId?:string;result?:string;[key:string]:unknown}>;quota:unknown};
