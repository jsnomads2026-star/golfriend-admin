import {useState} from 'react';
import type {CourseOperationsService} from './courseOperationsService';
// The normalizer is shared with a plain-Node regression test.
// @ts-expect-error JavaScript model is intentionally untyped at this boundary.
import {normalizeSiamInspection} from './siamProviderInspectionModel.mjs';

type State='idle'|'loading'|'ready'|'error';
type TextValue=string|number|boolean|null|undefined;
type InspectionCourse={courseID:string;courseName:string;providerCourseId:string;providerCourseName:string;providerClubId:string;providerParentId:string;latitude:number|null;longitude:number|null;coordinatesAvailable:boolean|null;geometryAvailable:boolean|null};
type BookingLeaf={name:string;url:string;email:string;phone:string;mobile:string;providerId:string};
type InspectionClub={clubID:string;clubName:string;listHadEmbeddedCourses:boolean;detailAddedCourseIDs:string[];providerClubId:string;providerClubName:string;providerParentId:string;providerPropertyId:string;providerPropertyType:string;providerBookable:boolean|null;address:string;address2:string;city:string;state:string;postalCode:string;country:string;countryCode:string;latitude:number|null;longitude:number|null;distanceKm:number|null;withinRequestedRadius:boolean|null;within50Km:boolean|null;phone:string;mobile:string;email:string;website:string;contactPhone:string;contactEmail:string;bookingUrl:string;reservationUrl:string;teeTimeUrl:string;reservationPhone:string;reservationEmail:string;bookingProviderId:string;reservationProviderId:string;providerBookingStructures:Record<'booking'|'reservation'|'teeTime'|'contact',BookingLeaf>;courses:InspectionCourse[]};
type Inspection={clubs:InspectionClub[];summary:{providerCallsUsed:number|null;unresolvedShells:Array<{clubID:string;clubName:string}>}};
const normalize=(value:unknown)=>normalizeSiamInspection(value) as Inspection;
const unavailable='PROVIDER DOES NOT SUPPLY';
const show=(value:TextValue)=>value===null||value===undefined||value===''?unavailable:String(value);
const fact=(label:string,value:TextValue)=><div key={label}><dt>{label}</dt><dd>{show(value)}</dd></div>;

function BookingStructure({label,value}:{label:string;value:BookingLeaf}){return <section className="siam-provider-structure"><h5>{label}</h5><dl>{fact('name',value.name)}{fact('url',value.url)}{fact('email',value.email)}{fact('phone',value.phone)}{fact('mobile',value.mobile)}{fact('providerId',value.providerId)}</dl></section>;}

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
      {result.clubs.length===0?<p>No provider clubs were returned for this inspection.</p>:result.clubs.map((club)=> <article key={club.providerClubId||club.clubID||club.providerClubName||club.clubName}>
        <h4>{club.providerClubName||club.clubName||unavailable}</h4>
        {club.within50Km===false&&<p className="siam-provider-outside">OUTSIDE 50 KM — diagnostic result only</p>}
        <h5>Identity</h5><dl>{fact('providerClubId',club.providerClubId)}{fact('providerClubName',club.providerClubName)}{fact('providerParentId',club.providerParentId)}{fact('providerPropertyId',club.providerPropertyId)}{fact('providerPropertyType',club.providerPropertyType)}{fact('providerBookable',club.providerBookable)}</dl>
        <h5>Location</h5><dl>{fact('address',club.address)}{fact('address2',club.address2)}{fact('city',club.city)}{fact('state',club.state)}{fact('postalCode',club.postalCode)}{fact('country',club.country)}{fact('countryCode',club.countryCode)}{fact('latitude',club.latitude)}{fact('longitude',club.longitude)}{fact('distanceKm',club.distanceKm)}{fact('withinRequestedRadius',club.withinRequestedRadius)}{fact('within50Km',club.within50Km)}</dl>
        <h5>Contact</h5><dl>{fact('phone',club.phone)}{fact('mobile',club.mobile)}{fact('email',club.email)}{fact('website',club.website)}{fact('contactPhone',club.contactPhone)}{fact('contactEmail',club.contactEmail)}</dl>
        <h5>Booking / reservation</h5><dl>{fact('bookingUrl',club.bookingUrl)}{fact('reservationUrl',club.reservationUrl)}{fact('teeTimeUrl',club.teeTimeUrl)}{fact('reservationPhone',club.reservationPhone)}{fact('reservationEmail',club.reservationEmail)}{fact('bookingProviderId',club.bookingProviderId)}{fact('reservationProviderId',club.reservationProviderId)}</dl>
        <div className="siam-provider-structures"><BookingStructure label="booking" value={club.providerBookingStructures.booking}/><BookingStructure label="reservation" value={club.providerBookingStructures.reservation}/><BookingStructure label="teeTime" value={club.providerBookingStructures.teeTime}/><BookingStructure label="contact" value={club.providerBookingStructures.contact}/></div>
        <h5>Layout children</h5>{club.courses.length===0?<p>{unavailable}</p>:<table><thead><tr><th>providerCourseId</th><th>providerCourseName</th><th>providerClubId</th><th>providerParentId</th><th>latitude / longitude</th><th>coordinatesAvailable</th><th>geometryAvailable</th></tr></thead><tbody>{club.courses.map((course)=><tr key={`${club.providerClubId}-${course.providerCourseId}-${course.courseID}`}><td>{show(course.providerCourseId)}</td><td>{show(course.providerCourseName)}</td><td>{show(course.providerClubId)}</td><td>{show(course.providerParentId)}</td><td>{show(course.latitude)} / {show(course.longitude)}</td><td>{show(course.coordinatesAvailable)}</td><td>{show(course.geometryAvailable)}</td></tr>)}</tbody></table>}
        <p><strong>listHadEmbeddedCourses:</strong> {String(club.listHadEmbeddedCourses)} &nbsp; <strong>detailAddedCourseIDs:</strong> {club.detailAddedCourseIDs.join(', ')||unavailable}</p>
      </article>)}
      <p><strong>summary.providerCallsUsed:</strong> {show(result.summary.providerCallsUsed)} &nbsp; <strong>summary.unresolvedShells:</strong> {result.summary.unresolvedShells.map((shell)=>shell.clubID||shell.clubName).join(', ')||unavailable}</p>
    </div>}
  </section>;
}
