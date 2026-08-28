import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebaseConfig';

export type CountryCoverage = Readonly<{
  country: string; totalCourses: number; coursesWithCoordinates: number; coursesMissingCoordinates: number;
  golfApiImportedCount: number; directConfirmedCount: number; providerEvidenceMissingCount: number; latestGolfriendFetchTime: string | null;
  job: null | Readonly<{ state: 'queued'|'running'|'paused'|'completed'|'failed'|'unavailable'; cycle: number; nextDueAtMs: number | null; retryAtMs: number | null; pauseReason: string | null }>;
}>;

export interface CourseOperationsService {
  loadCourses(): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  loadCountryCoverage(): Promise<CountryCoverage[]>;
  planCountry(country:string): Promise<Record<string,unknown>>;
  startCountry(country:string): Promise<Record<string,unknown>>;
  pauseCountry(country:string): Promise<Record<string,unknown>>;
  resumeCountry(country:string): Promise<Record<string,unknown>>;
  previewGlobalRefresh(): Promise<Record<string,unknown>>;
  setGlobalRefresh(enabled:boolean): Promise<Record<string,unknown>>;
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
    throw new Error('COURSE_CATALOGUE_BROWSER_READ_RETIRED');
  },
  async loadCountryCoverage() {
    const response = await httpsCallable(functions, 'getCourseCoverageByCountry')();
    const value = response.data as { schema?: unknown; countries?: unknown };
    if (value?.schema !== 'golfriend.course-coverage-by-country.v2' || !Array.isArray(value.countries)) throw new Error('COURSE_COVERAGE_INVALID');
    return value.countries as CountryCoverage[];
  },
  async planCountry(country) { return (await httpsCallable(functions,'planCourseCountryIngestion')({country})).data as Record<string,unknown>; },
  async startCountry(country) { return (await httpsCallable(functions,'startCourseCountryIngestion')({country,confirmed:true})).data as Record<string,unknown>; },
  async pauseCountry(country) { return (await httpsCallable(functions,'pauseCourseCountryIngestion')({country})).data as Record<string,unknown>; },
  async resumeCountry(country) { return (await httpsCallable(functions,'resumeCourseCountryIngestion')({country})).data as Record<string,unknown>; },
  async previewGlobalRefresh() { return (await httpsCallable(functions,'previewCourseCountryAutoRefresh')()).data as Record<string,unknown>; },
  async setGlobalRefresh(enabled) { return (await httpsCallable(functions,'setCourseCountryAutoRefresh')({enabled})).data as Record<string,unknown>; },
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
