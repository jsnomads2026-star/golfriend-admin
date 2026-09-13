const text=(value,max=2048)=>typeof value==='string'&&value.length<=max?value:'';
const number=(value)=>typeof value==='number'&&Number.isFinite(value)?value:null;
const boolean=(value)=>typeof value==='boolean'?value:null;
const textList=(value)=>Array.isArray(value)?value.map((item)=>text(item,160)).filter(Boolean):[];
const unresolvedShells=(value)=>Array.isArray(value)?value.map((item)=>{const row=item&&typeof item==='object'?item:{};return {clubID:text(row.clubID,160),clubName:text(row.clubName,512)};}).filter((item)=>item.clubID||item.clubName):[];
const bookingStructure=(value)=>{const row=value&&typeof value==='object'&&!Array.isArray(value)?value:{};return {name:text(row.name,512),url:text(row.url),email:text(row.email,320),phone:text(row.phone,128),mobile:text(row.mobile,128),providerId:text(row.providerId,160)};};
const bookingStructures=(value)=>{const row=value&&typeof value==='object'&&!Array.isArray(value)?value:{};return {booking:bookingStructure(row.booking),reservation:bookingStructure(row.reservation),teeTime:bookingStructure(row.teeTime),contact:bookingStructure(row.contact)};};

export function normalizeSiamInspection(value){
  const source=value&&typeof value==='object'?value:{};
  const rawClubs=Array.isArray(source.clubs)?source.clubs:[];
  const clubs=rawClubs.map((club)=>{
    const row=club&&typeof club==='object'?club:{};
    const rawCourses=Array.isArray(row.courses)?row.courses:[];
    return {
      clubID:text(row.clubID,160),clubName:text(row.clubName,512),listHadEmbeddedCourses:row.listHadEmbeddedCourses===true,detailAddedCourseIDs:textList(row.detailAddedCourseIDs),
      providerClubId:text(row.providerClubId,160),providerClubName:text(row.providerClubName,512),providerParentId:text(row.providerParentId,160),providerPropertyId:text(row.providerPropertyId,160),providerPropertyType:text(row.providerPropertyType,128),providerBookable:boolean(row.providerBookable),
      address:text(row.address,512),address2:text(row.address2,512),city:text(row.city,256),state:text(row.state,256),postalCode:text(row.postalCode,32),country:text(row.country,256),countryCode:text(row.countryCode,16),latitude:number(row.latitude),longitude:number(row.longitude),distanceKm:number(row.distanceKm),withinRequestedRadius:boolean(row.withinRequestedRadius),within50Km:boolean(row.within50Km),
      phone:text(row.phone,128),mobile:text(row.mobile,128),email:text(row.email,320),website:text(row.website),contactPhone:text(row.contactPhone,128),contactEmail:text(row.contactEmail,320),
      bookingUrl:text(row.bookingUrl),reservationUrl:text(row.reservationUrl),teeTimeUrl:text(row.teeTimeUrl),reservationPhone:text(row.reservationPhone,128),reservationEmail:text(row.reservationEmail,320),bookingProviderId:text(row.bookingProviderId,160),reservationProviderId:text(row.reservationProviderId,160),providerBookingStructures:bookingStructures(row.providerBookingStructures),
      courses:rawCourses.map((course)=>{const item=course&&typeof course==='object'?course:{};return {courseID:text(item.courseID,160),courseName:text(item.courseName,512),providerCourseId:text(item.providerCourseId,160),providerCourseName:text(item.providerCourseName,512),providerClubId:text(item.providerClubId,160),providerParentId:text(item.providerParentId,160),latitude:number(item.latitude),longitude:number(item.longitude),coordinatesAvailable:boolean(item.coordinatesAvailable),geometryAvailable:boolean(item.geometryAvailable)};}).filter((course)=>course.providerCourseId||course.courseID||course.providerCourseName||course.courseName)
    };
  }).filter((club)=>club.providerClubId||club.clubID||club.providerClubName||club.clubName);
  const summary=source.summary&&typeof source.summary==='object'?source.summary:{};
  return {clubs,summary:{providerCallsUsed:number(summary.providerCallsUsed),unresolvedShells:unresolvedShells(summary.unresolvedShells)}};
}
