import {useState} from 'react';
import type {CourseOperationsService} from './courseOperationsService';
// The normalizer is shared with a plain-Node regression test.
// @ts-expect-error JavaScript model is intentionally untyped at this boundary.
import {normalizeSiamInspection} from './siamProviderInspectionModel.mjs';

type State='idle'|'loading'|'ready'|'error';
type InspectionCourse={courseID:string;courseName:string;latitude:number|null;longitude:number|null};
type InspectionClub={clubID:string;clubName:string;listHadEmbeddedCourses:boolean;detailAddedCourseIDs:string[];latitude:number|null;longitude:number|null;courses:InspectionCourse[]};
type Inspection={clubs:InspectionClub[];summary:{providerCallsUsed:number|null;unresolvedShells:Array<{clubID:string;clubName:string}>}};
const normalize=(value:unknown)=>normalizeSiamInspection(value) as Inspection;

export default function V2SiamProviderInspector({service}:{service:CourseOperationsService}){
  const[state,setState]=useState<State>('idle');const[result,setResult]=useState<Inspection>(()=>normalize({}));
  const inspect=async()=>{setState('loading');try{setResult(normalize(await service.inspectSiamRegion()));setState('ready');}catch{setResult(normalize({}));setState('error');}};
  return <section className="siam-provider-inspector" aria-labelledby="siam-provider-title">
    <p className="siam-provider-banner">READ-ONLY PROVIDER INSPECTION — NO CATALOGUE WRITES</p>
    <h3 id="siam-provider-title">Siam provider inspection</h3>
    <p>Uses the server-authorized inspector for Pattaya, 50 km, search: Siam.</p>
    <button className="primary" onClick={()=>void inspect()} disabled={state==='loading'}>Inspect Siam 50 km</button>
    {state==='loading'&&<p role="status">Inspecting provider…</p>}
    {state==='error'&&<p role="alert">Provider inspection is unavailable. No catalogue data was changed.</p>}
    {state==='ready'&&<div className="siam-provider-results" aria-live="polite">
      {result.clubs.length===0?<p>No provider clubs were returned for this inspection.</p>:result.clubs.map((club)=> <article key={club.clubID||club.clubName}>
        <h4>{club.clubName||'Unnamed provider club'}</h4>
        <dl><div><dt>clubID</dt><dd>{club.clubID||'—'}</dd></div><div><dt>listHadEmbeddedCourses</dt><dd>{String(club.listHadEmbeddedCourses)}</dd></div><div><dt>detailAddedCourseIDs</dt><dd>{club.detailAddedCourseIDs.join(', ')||'—'}</dd></div><div><dt>latitude / longitude</dt><dd>{club.latitude??'—'} / {club.longitude??'—'}</dd></div></dl>
        {club.courses.length>0&&<table><thead><tr><th>courseID</th><th>courseName</th><th>latitude / longitude</th></tr></thead><tbody>{club.courses.map((course)=><tr key={`${club.clubID}-${course.courseID}-${course.courseName}`}><td>{course.courseID||'—'}</td><td>{course.courseName||'—'}</td><td>{course.latitude??'—'} / {course.longitude??'—'}</td></tr>)}</tbody></table>}
      </article>)}
      <p><strong>summary.providerCallsUsed:</strong> {result.summary.providerCallsUsed??'—'} &nbsp; <strong>summary.unresolvedShells:</strong> {result.summary.unresolvedShells.map((shell)=>shell.clubID||shell.clubName).join(', ')||'—'}</p>
    </div>}
  </section>;
}
