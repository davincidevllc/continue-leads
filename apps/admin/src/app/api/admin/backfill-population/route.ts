import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/pool';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/admin/backfill-population
 *
 * Updates the cities table with population data for the largest cities
 * in every US state. This ensures the 25-city-per-state cap in
 * generate-pages picks the most important cities instead of
 * falling back to alphabetical order.
 *
 * Source: US Census Bureau, 2020 Decennial Census (incorporated places).
 * Only cities with population >= ~15 000 are included — smaller ones
 * keep NULL and sort to the bottom (which is correct behaviour).
 */
export async function POST(request: NextRequest) {
  try {
    // Simple auth — require the staging bearer token
    const authHeader = request.headers.get('authorization');
    const secret = process.env.ADMIN_AUTH_SECRET;
    if (!secret || !authHeader || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── Population data: (slug, state_code, population) ────────────
    // Top ~30-50 cities per state, Census 2020 incorporated places
    const POPULATION_DATA: [string, string, number][] = [
      // Alabama
      ['birmingham','AL',200733],['huntsville','AL',215006],['montgomery','AL',200603],['mobile','AL',187041],['tuscaloosa','AL',99600],
      ['hoover','AL',92606],['auburn','AL',76143],['dothan','AL',71072],['decatur','AL',57938],['madison','AL',56933],
      ['florence','AL',40184],['gadsden','AL',33835],['vestavia-hills','AL',39166],['prattville','AL',37464],['phenix-city','AL',38816],
      ['opelika','AL',31166],['northport','AL',29550],['enterprise','AL',28711],['daphne','AL',28951],['homewood','AL',25170],
      ['alabaster','AL',34609],['prichard','AL',19622],['bessemer','AL',25820],['athens','AL',27232],['pelham','AL',26219],
      ['fairhope','AL',22477],['albertville','AL',22386],['anniston','AL',21518],['oxford','AL',21665],['troy','AL',19215],
      // Alaska
      ['anchorage','AK',291247],['fairbanks','AK',32515],['juneau','AK',32255],['wasilla','AK',12256],['sitka','AK',8458],
      ['ketchikan','AK',8192],['kenai','AK',7424],['kodiak','AK',5983],['bethel','AK',6325],['palmer','AK',7306],
      // Arizona
      ['phoenix','AZ',1608139],['tucson','AZ',542629],['mesa','AZ',504258],['chandler','AZ',275987],['gilbert','AZ',267918],
      ['glendale','AZ',248325],['scottsdale','AZ',241361],['peoria','AZ',190985],['tempe','AZ',180587],['surprise','AZ',143148],
      ['goodyear','AZ',95294],['yuma','AZ',95548],['buckeye','AZ',91502],['avondale','AZ',89862],['flagstaff','AZ',73964],
      ['lake-havasu-city','AZ',57301],['casa-grande','AZ',57025],['maricopa','AZ',58726],['queen-creek','AZ',60789],['prescott','AZ',45827],
      ['prescott-valley','AZ',45973],['san-luis','AZ',35257],['bullhead-city','AZ',42285],['apache-junction','AZ',41512],['oro-valley','AZ',45303],
      // Arkansas
      ['little-rock','AR',202591],['fort-smith','AR',89142],['fayetteville','AR',93949],['springdale','AR',86007],['jonesboro','AR',78576],
      ['rogers','AR',68669],['north-little-rock','AR',64591],['conway','AR',67336],['bentonville','AR',54164],['pine-bluff','AR',40065],
      ['hot-springs','AR',37930],['benton','AR',36820],['sherwood','AR',31825],['texarkana','AR',30259],['russellville','AR',29812],
      ['bella-vista','AR',30529],['cabot','AR',26352],['paragould','AR',28995],['jacksonville','AR',28643],['searcy','AR',23768],
      ['van-buren','AR',23620],['bryant','AR',22571],['west-memphis','AR',22815],['maumelle','AR',19401],['siloam-springs','AR',17417],
      // California
      ['los-angeles','CA',3898747],['san-diego','CA',1386932],['san-jose','CA',1013240],['san-francisco','CA',873965],['fresno','CA',542107],
      ['sacramento','CA',524943],['long-beach','CA',466742],['oakland','CA',433031],['bakersfield','CA',403455],['anaheim','CA',350365],
      ['santa-ana','CA',309441],['riverside','CA',314998],['stockton','CA',320804],['irvine','CA',307670],['chula-vista','CA',275487],
      ['fremont','CA',230504],['san-bernardino','CA',222101],['moreno-valley','CA',212477],['fontana','CA',214547],['modesto','CA',218464],
      ['glendale','CA',196543],['huntington-beach','CA',198711],['santa-clarita','CA',228673],['garden-grove','CA',172646],['oceanside','CA',176218],
      ['rancho-cucamonga','CA',177751],['ontario','CA',175265],['santa-rosa','CA',178127],['elk-grove','CA',176124],['corona','CA',157136],
      // Colorado
      ['denver','CO',715522],['colorado-springs','CO',478961],['aurora','CO',386261],['fort-collins','CO',169810],['lakewood','CO',155984],
      ['thornton','CO',141867],['arvada','CO',124402],['westminster','CO',116317],['pueblo','CO',111876],['centennial','CO',108418],
      ['greeley','CO',108795],['boulder','CO',105673],['longmont','CO',98885],['loveland','CO',76378],['broomfield','CO',74112],
      ['castle-rock','CO',73158],['commerce-city','CO',62273],['parker','CO',57706],['brighton','CO',41975],['northglenn','CO',39868],
      ['littleton','CO',47200],['security-widefield','CO',39206],['erie','CO',30505],['windsor','CO',35117],['wheat-ridge','CO',32455],
      // Connecticut
      ['bridgeport','CT',148529],['new-haven','CT',134023],['stamford','CT',135470],['hartford','CT',121054],['waterbury','CT',114403],
      ['norwalk','CT',91184],['danbury','CT',86518],['new-britain','CT',74135],['west-haven','CT',55584],['bristol','CT',61382],
      ['meriden','CT',60850],['milford','CT',55387],['middletown','CT',47717],['shelton','CT',41744],['norwich','CT',40125],
      ['torrington','CT',35515],['new-london','CT',27367],['ansonia','CT',18918],['derby','CT',12902],['groton','CT',38411],
      // Delaware
      ['wilmington','DE',70898],['dover','DE',39403],['newark','DE',33042],['middletown','DE',22350],['bear','DE',21425],
      ['glasgow','DE',15264],['brookside','DE',14353],['hockessin','DE',13527],['smyrna','DE',12883],['milford','DE',11463],
      // DC
      ['washington','DC',689545],
      // Florida
      ['jacksonville','FL',949611],['miami','FL',442241],['tampa','FL',384959],['orlando','FL',307573],['st-petersburg','FL',258308],
      ['hialeah','FL',223109],['port-st-lucie','FL',217627],['cape-coral','FL',194016],['tallahassee','FL',196169],['fort-lauderdale','FL',182760],
      ['pembroke-pines','FL',171178],['hollywood','FL',153627],['miramar','FL',134721],['gainesville','FL',141085],['coral-springs','FL',134394],
      ['clearwater','FL',117295],['palm-bay','FL',119760],['lakeland','FL',115424],['pompano-beach','FL',112118],['west-palm-beach','FL',117415],
      ['davie','FL',106306],['miami-gardens','FL',111640],['sunrise','FL',100026],['boca-raton','FL',99805],['deltona','FL',95027],
      // Georgia
      ['atlanta','GA',498715],['columbus','GA',206922],['augusta','GA',202081],['macon','GA',157346],['savannah','GA',147780],
      ['athens','GA',127064],['sandy-springs','GA',108080],['roswell','GA',92833],['johns-creek','GA',82453],['albany','GA',69654],
      ['warner-robins','GA',80308],['alpharetta','GA',65818],['marietta','GA',60972],['valdosta','GA',56457],['smyrna','GA',56666],
      ['brookhaven','GA',55554],['dunwoody','GA',51683],['peachtree-city','GA',38364],['newnan','GA',43549],['dalton','GA',34278],
      ['kennesaw','GA',33036],['statesboro','GA',33628],['gainesville','GA',43435],['hinesville','GA',34048],['woodstock','GA',35077],
      // Hawaii
      ['honolulu','HI',350964],['east-honolulu','HI',47868],['pearl-city','HI',45458],['hilo','HI',45703],['kailua','HI',38635],
      ['waipahu','HI',38216],['kaneohe','HI',34597],['mililani-town','HI',27629],['kahului','HI',30345],['ewa-gentry','HI',26080],
      // Idaho
      ['boise','ID',235684],['meridian','ID',117635],['nampa','ID',100200],['idaho-falls','ID',64059],['caldwell','ID',59773],
      ['pocatello','ID',56320],['coeur-dalene','ID',54628],['twin-falls','ID',51807],['post-falls','ID',39027],['lewiston','ID',33435],
      ['rexburg','ID',35399],['eagle','ID',30320],['moscow','ID',26225],['kuna','ID',24973],['mountain-home','ID',16498],
      // Illinois
      ['chicago','IL',2746388],['aurora','IL',180542],['joliet','IL',150362],['naperville','IL',149540],['rockford','IL',148655],
      ['elgin','IL',114797],['springfield','IL',114394],['peoria','IL',113150],['champaign','IL',88302],['waukegan','IL',89078],
      ['cicero','IL',85268],['bloomington','IL',78680],['arlington-heights','IL',77676],['evanston','IL',78110],['schaumburg','IL',78723],
      ['decatur','IL',70522],['palatine','IL',69144],['skokie','IL',67824],['des-plaines','IL',60675],['orland-park','IL',58590],
      ['tinley-park','IL',57144],['oak-lawn','IL',57073],['berwyn','IL',56657],['normal','IL',54469],['wheaton','IL',54367],
      // Indiana
      ['indianapolis','IN',887642],['fort-wayne','IN',263886],['evansville','IN',117298],['south-bend','IN',103453],['carmel','IN',99757],
      ['fishers','IN',98977],['bloomington','IN',79168],['hammond','IN',76574],['gary','IN',69093],['lafayette','IN',70783],
      ['muncie','IN',65194],['terre-haute','IN',58389],['kokomo','IN',58066],['noblesville','IN',69604],['anderson','IN',54826],
      ['greenwood','IN',63030],['westfield','IN',50898],['elkhart','IN',53923],['mishawaka','IN',49752],['lawrence','IN',48660],
      ['jeffersonville','IN',49227],['columbus','IN',46850],['portage','IN',37926],['new-albany','IN',38332],['richmond','IN',35720],
      // Iowa
      ['des-moines','IA',214237],['cedar-rapids','IA',137710],['davenport','IA',101724],['sioux-city','IA',85797],['iowa-city','IA',74828],
      ['waterloo','IA',67314],['ankeny','IA',67355],['ames','IA',66427],['west-des-moines','IA',68723],['council-bluffs','IA',62230],
      ['dubuque','IA',59667],['urbandale','IA',45580],['cedar-falls','IA',40585],['marion','IA',40338],['bettendorf','IA',39102],
      ['mason-city','IA',27069],['marshalltown','IA',27552],['clinton','IA',24475],['burlington','IA',24321],['fort-dodge','IA',24871],
      // Kansas
      ['wichita','KS',397532],['overland-park','KS',197238],['kansas-city','KS',156607],['olathe','KS',141290],['topeka','KS',126587],
      ['lawrence','KS',94934],['shawnee','KS',65513],['manhattan','KS',54832],['lenexa','KS',57434],['salina','KS',46994],
      ['hutchinson','KS',40006],['leavenworth','KS',36210],['leawood','KS',34659],['garden-city','KS',28451],['emporia','KS',24334],
      ['dodge-city','KS',27720],['derby','KS',25276],['junction-city','KS',22772],['prairie-village','KS',22957],['liberal','KS',19826],
      // Kentucky
      ['louisville','KY',633045],['lexington','KY',322570],['bowling-green','KY',72294],['owensboro','KY',60183],['covington','KY',40640],
      ['richmond','KY',37820],['georgetown','KY',37012],['florence','KY',32769],['hopkinsville','KY',30258],['nicholasville','KY',31935],
      ['elizabethtown','KY',30858],['henderson','KY',28042],['frankfort','KY',28602],['independence','KY',28239],['jeffersontown','KY',28050],
      ['paducah','KY',27137],['radcliff','KY',23116],['ashland','KY',20680],['madisonville','KY',18801],['murray','KY',18910],
      // Louisiana
      ['new-orleans','LA',383997],['baton-rouge','LA',227470],['shreveport','LA',187593],['metairie','LA',142489],['lafayette','LA',121374],
      ['lake-charles','LA',82275],['kenner','LA',66702],['bossier-city','LA',68159],['monroe','LA',47877],['alexandria','LA',47723],
      ['houma','LA',32649],['new-iberia','LA',30617],['laplace','LA',29604],['slidell','LA',27920],['central','LA',29306],
      ['ruston','LA',21987],['sulphur','LA',21112],['hammond','LA',20580],['natchitoches','LA',18323],['zachary','LA',17165],
      // Maine
      ['portland','ME',68408],['lewiston','ME',37121],['bangor','ME',32029],['south-portland','ME',25665],['auburn','ME',23603],
      ['biddeford','ME',22381],['sanford','ME',21578],['saco','ME',19926],['westbrook','ME',20181],['augusta','ME',18899],
      // Maryland
      ['baltimore','MD',585708],['columbia','MD',104681],['germantown','MD',90676],['silver-spring','MD',81015],['waldorf','MD',77005],
      ['ellicott-city','MD',75947],['glen-burnie','MD',72552],['frederick','MD',78171],['dundalk','MD',63597],['rockville','MD',67117],
      ['bethesda','MD',63374],['gaithersburg','MD',69657],['towson','MD',57542],['bowie','MD',58025],['aspen-hill','MD',53660],
      ['wheaton','MD',51509],['bel-air','MD',48656],['severn','MD',48432],['north-bethesda','MD',49278],['odenton','MD',42258],
      // Massachusetts
      ['boston','MA',675647],['worcester','MA',206518],['springfield','MA',155929],['cambridge','MA',118403],['lowell','MA',115554],
      ['brockton','MA',105643],['new-bedford','MA',101079],['quincy','MA',101636],['lynn','MA',101253],['fall-river','MA',93885],
      ['newton','MA',88923],['lawrence','MA',89143],['somerville','MA',81360],['framingham','MA',72032],['haverhill','MA',67838],
      ['waltham','MA',62227],['malden','MA',66263],['brookline','MA',63191],['plymouth','MA',61217],['medford','MA',59449],
      ['taunton','MA',59365],['chicopee','MA',55298],['weymouth','MA',57746],['revere','MA',62186],['peabody','MA',54251],
      ['methuen','MA',50706],['barnstable','MA',44414],['pittsfield','MA',42142],['attleboro','MA',46699],['leominster','MA',43782],
      // Michigan
      ['detroit','MI',639111],['grand-rapids','MI',198917],['warren','MI',139387],['sterling-heights','MI',134346],['ann-arbor','MI',123851],
      ['lansing','MI',112644],['flint','MI',95943],['dearborn','MI',109976],['livonia','MI',95535],['troy','MI',87294],
      ['clinton-township','MI',101168],['canton','MI',98659],['westland','MI',84094],['farmington-hills','MI',83986],['macomb','MI',86520],
      ['rochester-hills','MI',76227],['southfield','MI',73006],['kalamazoo','MI',72570],['shelby','MI',79000],['wyoming','MI',77331],
      ['portage','MI',49340],['royal-oak','MI',59258],['st-clair-shores','MI',59929],['novi','MI',60489],['pontiac','MI',61606],
      // Minnesota
      ['minneapolis','MN',429954],['st-paul','MN',311527],['rochester','MN',121395],['bloomington','MN',89987],['duluth','MN',90884],
      ['brooklyn-park','MN',86478],['plymouth','MN',81026],['maple-grove','MN',76122],['woodbury','MN',75102],['st-cloud','MN',70093],
      ['lakeville','MN',69490],['eagan','MN',68085],['blaine','MN',70222],['eden-prairie','MN',64198],['burnsville','MN',64317],
      ['coon-rapids','MN',63369],['apple-valley','MN',56374],['minnetonka','MN',53781],['edina','MN',53494],['shakopee','MN',44012],
      ['st-louis-park','MN',50010],['maplewood','MN',41425],['moorhead','MN',44505],['mankato','MN',44488],['cottage-grove','MN',37494],
      // Mississippi
      ['jackson','MS',153701],['gulfport','MS',72926],['southaven','MS',54944],['hattiesburg','MS',48588],['biloxi','MS',46212],
      ['olive-branch','MS',42698],['tupelo','MS',38300],['meridian','MS',33919],['pearl','MS',27132],['madison','MS',28079],
      ['oxford','MS',28122],['clinton','MS',24797],['horn-lake','MS',27775],['brandon','MS',24476],['starkville','MS',25495],
      ['ridgeland','MS',24722],['columbus','MS',23640],['vicksburg','MS',21536],['pascagoula','MS',21692],['ocean-springs','MS',18023],
      // Missouri
      ['kansas-city','MO',508090],['st-louis','MO',301578],['springfield','MO',169176],['columbia','MO',126254],['independence','MO',123011],
      ['lees-summit','MO',101108],['ofallon','MO',91316],['st-joseph','MO',72473],['st-charles','MO',70093],['st-peters','MO',57732],
      ['blue-springs','MO',56422],['florissant','MO',51443],['joplin','MO',51762],['chesterfield','MO',49999],['jefferson-city','MO',43079],
      ['cape-girardeau','MO',42055],['wildwood','MO',35517],['university-city','MO',35371],['ballwin','MO',30404],['raytown','MO',29176],
      ['liberty','MO',31507],['wentzville','MO',40924],['maryland-heights','MO',26764],['gladstone','MO',27129],['sedalia','MO',21852],
      // Montana
      ['billings','MT',119798],['missoula','MT',73489],['great-falls','MT',60442],['bozeman','MT',53293],['butte','MT',34751],
      ['helena','MT',32091],['kalispell','MT',26884],['havre','MT',9362],['anaconda','MT',9153],['miles-city','MT',8410],
      // Nebraska
      ['omaha','NE',486051],['lincoln','NE',291082],['bellevue','NE',64176],['grand-island','NE',53131],['kearney','NE',33464],
      ['fremont','NE',26397],['norfolk','NE',24610],['hastings','NE',25152],['north-platte','NE',23807],['columbus','NE',23291],
      ['papillion','NE',24310],['la-vista','NE',18219],['scottsbluff','NE',14542],['south-sioux-city','NE',13353],['beatrice','NE',12282],
      // Nevada
      ['las-vegas','NV',641903],['henderson','NV',320189],['reno','NV',264165],['north-las-vegas','NV',262527],['sparks','NV',108445],
      ['carson-city','NV',58639],['fernley','NV',22191],['elko','NV',22035],['mesquite','NV',22536],['boulder-city','NV',16700],
      // New Hampshire
      ['manchester','NH',115644],['nashua','NH',91322],['concord','NH',43976],['derry','NH',34317],['rochester','NH',32492],
      ['dover','NH',32741],['salem','NH',30009],['merrimack','NH',26632],['hudson','NH',25394],['londonderry','NH',26456],
      ['keene','NH',23409],['bedford','NH',22710],['portsmouth','NH',22158],['goffstown','NH',18261],['laconia','NH',16871],
      // New Jersey
      ['newark','NJ',311549],['jersey-city','NJ',292449],['paterson','NJ',159732],['elizabeth','NJ',137298],['lakewood','NJ',135158],
      ['edison','NJ',107588],['woodbridge','NJ',103353],['toms-river','NJ',95438],['trenton','NJ',90871],['clifton','NJ',89460],
      ['camden','NJ',71791],['brick','NJ',75667],['cherry-hill','NJ',73348],['passaic','NJ',72622],['middletown','NJ',65458],
      ['union-city','NJ',72032],['old-bridge','NJ',68195],['gloucester','NJ',64634],['north-bergen','NJ',63742],['bayonne','NJ',71828],
      ['vineland','NJ',60368],['east-orange','NJ',65115],['franklin','NJ',67605],['new-brunswick','NJ',57609],['piscataway','NJ',60500],
      // New Mexico
      ['albuquerque','NM',564559],['las-cruces','NM',111385],['rio-rancho','NM',104046],['santa-fe','NM',87505],['roswell','NM',48422],
      ['farmington','NM',45877],['south-valley','NM',41270],['hobbs','NM',40508],['clovis','NM',38962],['alamogordo','NM',31384],
      ['carlsbad','NM',32238],['las-vegas','NM',13208],['deming','NM',14083],['gallup','NM',21678],['sunland-park','NM',18596],
      // New York
      ['new-york','NY',8336817],['buffalo','NY',278349],['rochester','NY',211328],['yonkers','NY',211569],['syracuse','NY',148620],
      ['albany','NY',99224],['new-rochelle','NY',79726],['mount-vernon','NY',73893],['schenectady','NY',67878],['utica','NY',65284],
      ['white-plains','NY',58109],['binghamton','NY',47969],['troy','NY',51401],['niagara-falls','NY',48671],['hempstead','NY',55361],
      ['long-beach','NY',33454],['saratoga-springs','NY',31195],['ithaca','NY',32852],['rome','NY',32148],['poughkeepsie','NY',30515],
      ['north-tonawanda','NY',30013],['jamestown','NY',28712],['valley-stream','NY',37659],['spring-valley','NY',32090],['freeport','NY',43682],
      // North Carolina
      ['charlotte','NC',874579],['raleigh','NC',467665],['greensboro','NC',299035],['durham','NC',283506],['winston-salem','NC',249545],
      ['fayetteville','NC',208501],['cary','NC',174721],['wilmington','NC',115451],['high-point','NC',112791],['concord','NC',105240],
      ['asheville','NC',94067],['greenville','NC',87521],['jacksonville','NC',74651],['gastonia','NC',80411],['chapel-hill','NC',61960],
      ['huntersville','NC',62674],['apex','NC',73890],['burlington','NC',57303],['kannapolis','NC',53022],['mooresville','NC',50762],
      ['rocky-mount','NC',54330],['holly-springs','NC',46353],['indian-trail','NC',42580],['matthews','NC',32723],['sanford','NC',30067],
      // North Dakota
      ['fargo','ND',125990],['bismarck','ND',73622],['grand-forks','ND',55839],['minot','ND',48639],['west-fargo','ND',38626],
      ['williston','ND',29160],['dickinson','ND',25860],['mandan','ND',22752],['jamestown','ND',15168],['wahpeton','ND',7606],
      // Ohio
      ['columbus','OH',905748],['cleveland','OH',372624],['cincinnati','OH',309317],['toledo','OH',270871],['akron','OH',190469],
      ['dayton','OH',137644],['parma','OH',81601],['canton','OH',70872],['youngstown','OH',60068],['lorain','OH',65211],
      ['hamilton','OH',62477],['springfield','OH',58662],['kettering','OH',57862],['lakewood','OH',52131],['elyria','OH',54857],
      ['cuyahoga-falls','OH',51114],['euclid','OH',46866],['dublin','OH',49328],['middletown','OH',48694],['mentor','OH',46742],
      ['mansfield','OH',47049],['beavercreek','OH',47106],['strongsville','OH',44789],['grove-city','OH',41820],['fairfield','OH',42510],
      // Oklahoma
      ['oklahoma-city','OK',681054],['tulsa','OK',413066],['norman','OK',128026],['broken-arrow','OK',113540],['edmond','OK',99662],
      ['lawton','OK',91055],['moore','OK',62793],['midwest-city','OK',57985],['enid','OK',50122],['stillwater','OK',50396],
      ['owasso','OK',39722],['bartlesville','OK',37290],['muskogee','OK',36242],['shawnee','OK',31867],['bixby','OK',28038],
      ['yukon','OK',28011],['ponca-city','OK',23586],['ardmore','OK',24698],['duncan','OK',22737],['jenks','OK',24379],
      // Oregon
      ['portland','OR',652503],['salem','OR',175535],['eugene','OR',176654],['gresham','OR',113103],['hillsboro','OR',106894],
      ['beaverton','OR',97590],['bend','OR',99178],['medford','OR',85824],['springfield','OR',62256],['corvallis','OR',59922],
      ['albany','OR',56472],['tigard','OR',55767],['lake-oswego','OR',40431],['redmond','OR',36422],['tualatin','OR',27906],
      ['grants-pass','OR',39536],['oregon-city','OR',37339],['woodburn','OR',27562],['mcminnville','OR',35270],['west-linn','OR',26460],
      // Pennsylvania
      ['philadelphia','PA',1603797],['pittsburgh','PA',302971],['allentown','PA',126092],['reading','PA',95112],['erie','PA',94831],
      ['scranton','PA',76997],['bethlehem','PA',75781],['lancaster','PA',63492],['harrisburg','PA',50099],['york','PA',44747],
      ['wilkes-barre','PA',44328],['chester','PA',36395],['norristown','PA',34947],['williamsport','PA',28356],['easton','PA',28726],
      ['lebanon','PA',26051],['hazleton','PA',26898],['new-castle','PA',22210],['johnstown','PA',18411],['mckeesport','PA',19731],
      // Rhode Island
      ['providence','RI',190934],['cranston','RI',82934],['warwick','RI',82823],['pawtucket','RI',75604],['east-providence','RI',47139],
      ['woonsocket','RI',44478],['coventry','RI',35688],['cumberland','RI',36405],['north-providence','RI',34142],['south-kingstown','RI',31050],
      ['west-warwick','RI',29078],['johnston','RI',29568],['north-kingstown','RI',27673],['newport','RI',25163],['bristol','RI',22493],
      // South Carolina
      ['charleston','SC',150227],['columbia','SC',136632],['north-charleston','SC',114852],['mount-pleasant','SC',96946],['rock-hill','SC',74410],
      ['greenville','SC',72095],['summerville','SC',53643],['goose-creek','SC',47161],['sumter','SC',43463],['hilton-head-island','SC',40000],
      ['florence','SC',40342],['spartanburg','SC',38765],['myrtle-beach','SC',35682],['greer','SC',33994],['aiken','SC',31450],
      ['anderson','SC',28382],['mauldin','SC',26256],['easley','SC',22135],['simpsonville','SC',23704],['north-augusta','SC',23585],
      // South Dakota
      ['sioux-falls','SD',192517],['rapid-city','SD',77503],['aberdeen','SD',28324],['brookings','SD',24991],['watertown','SD',22655],
      ['mitchell','SD',15660],['yankton','SD',15411],['huron','SD',14263],['pierre','SD',14091],['spearfish','SD',12193],
      // Tennessee
      ['nashville','TN',689447],['memphis','TN',633104],['knoxville','TN',190740],['chattanooga','TN',181099],['clarksville','TN',166722],
      ['murfreesboro','TN',152769],['franklin','TN',83454],['jackson','TN',68205],['johnson-city','TN',71046],['bartlett','TN',59000],
      ['hendersonville','TN',58113],['kingsport','TN',54505],['collierville','TN',51480],['smyrna','TN',55334],['spring-hill','TN',55027],
      ['cleveland','TN',47359],['brentwood','TN',43983],['germantown','TN',39375],['lebanon','TN',36741],['mount-juliet','TN',40585],
      ['gallatin','TN',43837],['cookeville','TN',36284],['morristown','TN',30012],['oak-ridge','TN',31382],['maryville','TN',29741],
      // Texas
      ['houston','TX',2304580],['san-antonio','TX',1434625],['dallas','TX',1304379],['austin','TX',961855],['fort-worth','TX',918915],
      ['el-paso','TX',678815],['arlington','TX',394266],['corpus-christi','TX',317863],['plano','TX',285494],['laredo','TX',255205],
      ['lubbock','TX',263930],['garland','TX',246018],['irving','TX',256684],['frisco','TX',200509],['mckinney','TX',195308],
      ['amarillo','TX',200393],['grand-prairie','TX',196100],['brownsville','TX',186738],['killeen','TX',153095],['pasadena','TX',152272],
      ['mesquite','TX',150108],['mcallen','TX',142210],['midland','TX',146038],['denton','TX',139869],['carrollton','TX',138625],
      // Utah
      ['salt-lake-city','UT',199723],['west-valley-city','UT',140230],['west-jordan','UT',116961],['provo','UT',115162],['sandy','UT',96904],
      ['orem','UT',97521],['ogden','UT',87321],['st-george','UT',95342],['layton','UT',81742],['south-jordan','UT',77487],
      ['lehi','UT',75907],['millcreek','UT',63078],['taylorsville','UT',60711],['logan','UT',58786],['murray','UT',50637],
      ['draper','UT',51017],['bountiful','UT',44883],['riverton','UT',45285],['herriman','UT',55144],['eagle-mountain','UT',43623],
      ['spanish-fork','UT',42602],['roy','UT',39736],['pleasant-grove','UT',38935],['tooele','UT',40311],['springville','UT',36232],
      // Vermont
      ['burlington','VT',44743],['south-burlington','VT',20292],['rutland','VT',15807],['barre','VT',8491],['montpelier','VT',8074],
      ['winooski','VT',7997],['st-albans','VT',6877],['newport','VT',4678],['vergennes','VT',2588],['st-johnsbury','VT',5852],
      // Virginia
      ['virginia-beach','VA',459470],['norfolk','VA',238005],['chesapeake','VA',249422],['richmond','VA',226610],['newport-news','VA',186247],
      ['alexandria','VA',159467],['hampton','VA',137148],['roanoke','VA',100011],['portsmouth','VA',97915],['suffolk','VA',94324],
      ['lynchburg','VA',82168],['harrisonburg','VA',53078],['leesburg','VA',53727],['charlottesville','VA',46553],['manassas','VA',41085],
      ['blacksburg','VA',44826],['fredericksburg','VA',32024],['danville','VA',40044],['winchester','VA',28078],['salem','VA',25432],
      ['staunton','VA',25750],['herndon','VA',24577],['waynesboro','VA',22630],['radford','VA',18249],['colonial-heights','VA',17370],
      // Washington
      ['seattle','WA',737015],['spokane','WA',228989],['tacoma','WA',219346],['vancouver','WA',190915],['bellevue','WA',151854],
      ['kent','WA',136588],['everett','WA',110629],['renton','WA',106785],['spokane-valley','WA',102976],['federal-way','WA',101030],
      ['kirkland','WA',92175],['auburn','WA',87186],['bellingham','WA',90821],['marysville','WA',70714],['redmond','WA',73256],
      ['pasco','WA',77100],['lakewood','WA',65534],['kennewick','WA',82633],['burien','WA',52066],['olympia','WA',55605],
      ['sammamish','WA',65892],['shoreline','WA',57027],['richland','WA',60560],['lynnwood','WA',41691],['lacey','WA',55504],
      // West Virginia
      ['charleston','WV',46536],['huntington','WV',46842],['morgantown','WV',30955],['parkersburg','WV',28370],['wheeling','WV',27062],
      ['weirton','WV',18706],['fairmont','WV',18443],['martinsburg','WV',17465],['beckley','WV',16483],['clarksburg','WV',15743],
      // Wisconsin
      ['milwaukee','WI',577222],['madison','WI',269840],['green-bay','WI',107395],['kenosha','WI',99986],['racine','WI',78199],
      ['appleton','WI',75644],['waukesha','WI',72489],['eau-claire','WI',69421],['oshkosh','WI',66778],['janesville','WI',65615],
      ['west-allis','WI',60411],['la-crosse','WI',52680],['sheboygan','WI',49929],['wauwatosa','WI',48387],['fond-du-lac','WI',44425],
      ['brookfield','WI',40690],['new-berlin','WI',40132],['wausau','WI',39754],['beloit','WI',36966],['greenfield','WI',37117],
      ['fitchburg','WI',30752],['franklin','WI',36013],['oak-creek','WI',37471],['manitowoc','WI',32547],['sun-prairie','WI',35775],
      // Wyoming
      ['cheyenne','WY',65132],['casper','WY',59628],['laramie','WY',32158],['gillette','WY',33403],['rock-springs','WY',23389],
      ['sheridan','WY',18186],['green-river','WY',12025],['evanston','WY',11703],['riverton','WY',10970],['jackson','WY',10585],
    ];

    const client = await (pool as any).connect();

    try {
      await client.query('BEGIN');

      // Batch updates using a CTE with VALUES list
      // Process in chunks of 200 to avoid overly long SQL
      const CHUNK = 200;
      let matched = 0;

      for (let i = 0; i < POPULATION_DATA.length; i += CHUNK) {
        const chunk = POPULATION_DATA.slice(i, i + CHUNK);
        const valuesClauses: string[] = [];
        const params: (string | number)[] = [];
        let p = 1;

        for (const [slug, state, pop] of chunk) {
          valuesClauses.push(`($${p++}, $${p++}, $${p++}::int)`);
          params.push(slug, state, pop);
        }

        const result = await client.query(`
          UPDATE cities c
          SET population = v.pop
          FROM (VALUES ${valuesClauses.join(',')}) AS v(slug, state_code, pop)
          WHERE c.slug = v.slug AND c.state_code = v.state_code AND (c.population IS NULL OR c.population != v.pop)
        `, params);

        matched += result.rowCount || 0;
      }

      await client.query('COMMIT');

      // Verification: top 5 cities per a few key states
      const verify = await client.query(`
        WITH ranked AS (
          SELECT name, state_code, population,
            ROW_NUMBER() OVER (PARTITION BY state_code ORDER BY population DESC NULLS LAST) AS rn
          FROM cities
          WHERE state_code IN ('MA','CA','TX','NY','FL')
        )
        SELECT name, state_code, population FROM ranked WHERE rn <= 5
        ORDER BY state_code, rn
      `);

      const nullCount = await client.query(
        "SELECT COUNT(*)::int AS count FROM cities WHERE population IS NULL"
      );

      return NextResponse.json({
        success: true,
        rows_updated: matched,
        total_population_entries: POPULATION_DATA.length,
        cities_still_null: nullCount.rows[0].count,
        sample_top5: verify.rows,
      }, { status: 200 });

    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
