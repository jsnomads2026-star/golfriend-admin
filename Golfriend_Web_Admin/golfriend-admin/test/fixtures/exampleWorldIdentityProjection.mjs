// Immutable identity-only projection copied from the canonical Example World contract.
// Source: golfriend-example-world@ce37bf542d771520198695450b7bab3ac3e78c16
const rows=[
['dev_mock_ew_01','Example Golfer 01','Pattaya','TH','new','incomplete'],
['dev_mock_ew_02','Example Golfer 02','Bangkok','TH','established','verified'],
['dev_mock_ew_03','Example Golfer 03','Seoul','KR','vip','verified'],
['dev_mock_ew_04','Example Golfer 04','Tokyo','JP','verification_issue','issue'],
['dev_mock_ew_05','Example Golfer 05','Manila','PH','incomplete','incomplete'],
['dev_mock_ew_06','Example Golfer 06','Sydney','AU','established','verified'],
['dev_mock_ew_07','Example Golfer 07','Kuala Lumpur','MY','established','verified'],
['dev_mock_ew_08','Example Golfer 08','Singapore','SG','vip','verified'],
['dev_mock_ew_09','Example Golfer 09','Jakarta','ID','new','incomplete'],
['dev_mock_ew_10','Example Golfer 10','London','GB','established','verified'],
['dev_mock_ew_11','Example Golfer 11','Dubai','AE','moderation_review','issue'],
['dev_mock_ew_12','Example Golfer 12','Berlin','DE','blocked_reported_example','verified']
];
export const EXAMPLE_WORLD_IDENTITIES=Object.freeze(rows.map(([id,nickname,city,country,member,verification])=>Object.freeze({id,namespace:'dev_mock',nickname,city,country,status:Object.freeze({member,verification})})));
