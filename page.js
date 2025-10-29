// ========================= ПАТЧ: стабильный TOTAL и детерминированный порядок =========================
// Ключевые изменения:
// 1) TOTAL считаем из SQL-множества (allData), а не из finalRes.
// 2) По умолчанию OpenSearch используется ТОЛЬКО для ранжирования и хайлайта (не фильтрует множество).
//    Это убирает «плавание» TOTAL между страницами из-за приближённого kNN.
//    Если нужно сохранить старую семантику (OS фильтрует множество) — включите STRICT_OS_FILTER = true.
// 3) Добавлены детерминирующие тай-брейки в логике сортировки (на стороне кода).
// 4) Исправлена опечатка в формуле стажа (hire_date сравнивался с birth_date).
// ======================================================================================================

// ---------- НАСТРОЙКИ ----------
var STRICT_OS_FILTER = false; // true => как раньше: пересекаем множество с OS-хитами (TOTAL может «плавать»). false => OS только ранжирует.

// нормализация названий блоков OpenSearch
function normalize_match_name(sName) {
    if (StrContains(sName, "skills")) return "skills";
    if (StrContains(sName, "project")) return "projects";
    if (StrContains(sName, "resume")) return "resume";
    return sName;
}

// Копирование объекта xrow
function row_to_obj(xrow) {
    return tools.read_object(tools.object_to_text(xrow, "json"));
}

// ----------------------- Логирование -----------------------
function createLogMetrics() {
    var iUserId = OptInt(curUserID, 0);
    var logObj = new Object();
    var dateTime =  Date();

    var oCollFullname = ArrayOptFirstElem(tools.xquery("sql:SELECT fullname FROM collaborators  cs WHERE  cs.id = " + iUserId + ";"));
    
    logObj = {
        user_id: iUserId,
        user_fullname: oCollFullname.fullname,
        date: dateTime
    };
    var newDoc = tools.new_doc_by_name('cc_log_collaborator_search');
    newDoc.BindToDb(DefaultDb);
    newDoc.TopElem.collaborator_id = logObj.user_id;
    newDoc.TopElem.collaborator_fullname = logObj.user_fullname;
    newDoc.TopElem.date = logObj.date;
    newDoc.Save();
}
// ----------------------- Логирование -----------------------

queryObj = tools.read_object(Query);

// фильтры и параметры пейджирования переданные в строке запроса
page_number = queryObj.GetOptProperty("page_number");
page_size = queryObj.GetOptProperty("page_size");
sort_field = queryObj.GetOptProperty("sort_by", "_score");
sort_direct = queryObj.GetOptProperty("sort_order", "ASC");

// нормализуем сортировку по score
if (sort_field == "_score") sort_field = "score";

// проверка на переданное тело запроса
bodyObj = undefined;
if (Body != ""){
	bodyObj = tools.read_object(Body)
}

// фильтры переданные в теле запроса
searchDeclare = "";
searchFilter = "";

locationDeclare = "";
locationFilter = "";

generalDeclare = "";
generalFilter = "";

projectsDeclare = "";
projectsFilter = "";

educationDeclare = "";
educationFilter = "";

certificatesDeclare = "";
certificatesFilter = "";

hobbiesDeclare = "";
hobbiesFilter = "";

collaboratorsDeclare = "";
collaboratorsFilter = "";

arrKeywords=[]

if (bodyObj != undefined) {
    // поиск по фио, должности, табельному
    search = bodyObj.GetOptProperty("search");

	include_dismiss = bodyObj.GetOptProperty("include_dismiss", false);
	arr_keywords = bodyObj.GetOptProperty("arr_keywords");
	// поддержка старого имени
	if (arr_keywords == undefined) {
		arrKeywords = bodyObj.GetOptProperty("arr_keywords", []);
	} else {
		arrKeywords = arr_keywords;
	}
	arrKeywords = (arrKeywords != undefined) ? arrKeywords : [];
	is_semantic_search = bodyObj.GetOptProperty("is_semantic_search", true);
	search_fields = bodyObj.GetOptProperty("search_fields");

    // Фильтр по general
    general = bodyObj.GetOptProperty("general");
    if (general != undefined) {
        ageFrom = general.GetOptProperty("ageFrom");
        ageTo = general.GetOptProperty("ageTo");
        experienceFrom = general.GetOptProperty("experienceFrom");
        experienceTo = general.GetOptProperty("experienceTo");
        position_ids = general.GetOptProperty("position_ids");
        filial_ids = general.GetOptProperty("filial_ids");
        subdivisions_ids = general.GetOptProperty("subdivisions_ids");
        
        if (ageFrom != undefined) {
            generalDeclare += "
                DECLARE @ageFrom INT = " + OptInt(ageFrom,0)+";";
            generalFilter += " 
                AND DATEDIFF(YEAR, cs.birth_date, GETDATE()) - 
                     CASE WHEN MONTH(GETDATE()) < MONTH(cs.birth_date) 
                     OR (MONTH(GETDATE()) = MONTH(cs.birth_date) AND DAY(GETDATE()) < DAY(cs.birth_date)) 
                     THEN 1 ELSE 0 END >= @ageFrom";
        }
        if (ageTo != undefined) {
            generalDeclare += "
                DECLARE @ageTo INT = " + OptInt(ageTo,0)+";";
            generalFilter += " 
                AND DATEDIFF(YEAR, cs.birth_date, GETDATE()) - 
                    CASE WHEN MONTH(GETDATE()) < MONTH(cs.birth_date) 
                    OR (MONTH(GETDATE()) = MONTH(cs.birth_date) AND DAY(GETDATE()) < DAY(cs.birth_date)) 
                    THEN 1 ELSE 0 END <= @ageTo";
        }
        if (experienceFrom != undefined) {
            generalDeclare += "
                DECLARE @experienceFrom INT = " + OptInt(experienceFrom,0)+";";
            generalFilter += " 
                AND DATEDIFF(YEAR, cs.hire_date, GETDATE()) - 
                    CASE WHEN MONTH(GETDATE()) < MONTH(cs.hire_date) 
                    OR (MONTH(GETDATE()) = MONTH(cs.hire_date) AND DAY(GETDATE()) < DAY(cs.hire_date)) 
                    THEN 1 ELSE 0 END >= @experienceFrom";
        }
        if (experienceTo != undefined) {
            generalDeclare += "
                DECLARE @experienceTo INT = " + OptInt(experienceTo,0)+";";
            generalFilter += " 
                AND DATEDIFF(YEAR, cs.hire_date, GETDATE()) - 
                    CASE WHEN MONTH(GETDATE()) < MONTH(cs.hire_date) 
                    OR (MONTH(GETDATE()) = MONTH(cs.hire_date) AND DAY(GETDATE()) < DAY(cs.hire_date)) 
                    THEN 1 ELSE 0 END <= @experienceTo";
        }
        if (position_ids != undefined) {
            generalDeclare += "
			    DECLARE @position_ids_str NVARCHAR(MAX) = " + SqlLiteral(ArrayMerge(position_ids,"This",";"))+"
                DECLARE
                    @pos_ids AS TABLE(
                    id nvarchar(max)
                    );
                INSERT INTO @pos_ids
                SELECT value FROM string_split(@position_ids_str, ';');
		        ";
            generalFilter += " 
                JOIN @pos_ids pids ON pids.id = ps.name ";
        }
        if (filial_ids != undefined) {
            generalDeclare += "
			    DECLARE @filial_ids_str NVARCHAR(MAX) = " + SqlLiteral(ArrayMerge(filial_ids,"This",";"))+"
                DECLARE
                    @filial_ids AS TABLE(
                    id BIGINT
                    );
                INSERT INTO @filial_ids
                SELECT value FROM string_split(@filial_ids_str, ';');
		        ";
            generalFilter += " 
                JOIN @filial_ids filialids ON filialids.id = cs.place_id ";
        }
        if (subdivisions_ids != undefined) {
            generalDeclare += "
			    DECLARE @subdivisions_ids_str NVARCHAR(MAX) = " + SqlLiteral(ArrayMerge(subdivisions_ids,"This",";"))+"
                DECLARE
                    @subdivisions_ids AS TABLE(
                    id BIGINT
                    );
                INSERT INTO @subdivisions_ids
                SELECT value FROM string_split(@subdivisions_ids_str, ';');
		        ";
            generalFilter += " 
                JOIN @subdivisions_ids subids ON subids.id = ps.parent_object_id ";
        }
    }

    // Фильтр по location
    location = bodyObj.GetOptProperty("location");
    if (location != undefined) {
        country_ids = location.GetOptProperty("country_ids");
        city_ids = location.GetOptProperty("city_ids");
        if (country_ids != undefined) {
            locationDeclare += "
			    DECLARE @country_ids_str NVARCHAR(MAX) = " + SqlLiteral(ArrayMerge(country_ids,"This",";"))+"
                DECLARE
                    @country_ids AS TABLE(
                    id BIGINT
                    );
                INSERT INTO @country_ids
                SELECT value FROM string_split(@country_ids_str, ';');
		        ";
            locationFilter += " 
                JOIN regions country_regions ON country_regions.id = cs.region_id
                JOIN @country_ids countryids ON countryids.id = country_regions.parent_object_id";
        }
        if (city_ids != undefined) {
            locationDeclare += "
                DECLARE @city_ids_str NVARCHAR(MAX) = " + SqlLiteral(ArrayMerge(city_ids,"This",";"))+"
                DECLARE
                    @city_ids AS TABLE(
                    id BIGINT
                    );
                INSERT INTO @city_ids
                SELECT value FROM string_split(@city_ids_str, ';');
                ";
            locationFilter += " 
                JOIN @city_ids cityids ON cityids.id = cs.region_id";
        }
    }

    // Фильтр по конкретным сотрудникам (список ID)
    collaborator_ids = bodyObj.GetOptProperty("collaborator_ids");
    if (collaborator_ids != undefined) {
        collaboratorsDeclare += "
            DECLARE @collaborator_ids_str NVARCHAR(MAX) = " + SqlLiteral(ArrayMerge(collaborator_ids,"This",";")) + ";
            DECLARE @collaborator_ids TABLE (id BIGINT);
            INSERT INTO @collaborator_ids
            SELECT TRY_CAST(value AS BIGINT) 
            FROM string_split(@collaborator_ids_str, ';')
            WHERE TRY_CAST(value AS BIGINT) IS NOT NULL;";
        collaboratorsFilter += "
            JOIN @collaborator_ids collids ON collids.id = cs.id";
    }

    // Фильтр по projects
    projects_data = bodyObj.GetOptProperty("projects");
    if (projects_data != undefined) {
        client_ids = projects_data.GetOptProperty("client_ids");
        project_ids = projects_data.GetOptProperty("project_ids");
        end_date_from = projects_data.GetOptProperty("end_date_from");
        end_date_to = projects_data.GetOptProperty("end_date_to");
        subject_area_ids = projects_data.GetOptProperty("subject_area_ids");
        role_ids = projects_data.GetOptProperty("role_ids");
        
        if (end_date_from != undefined) {
            projectsDeclare += "
                DECLARE @endDateFrom Date = " + SqlLiteral(end_date_from)+";";
            projectsFilter += " 
                AND DATEDIFF(DAY, heps.end_date_project, @endDateFrom) <= 0";
        }
        if (end_date_to != undefined) {
            projectsDeclare += "
                DECLARE @endDateTo Date = " + SqlLiteral(end_date_to)+";";
            projectsFilter += " 
                AND DATEDIFF(DAY, heps.end_date_project, @endDateTo) >= 0";
        }
        if (client_ids != undefined) {
            projectsDeclare += "
			    DECLARE @client_ids_str NVARCHAR(MAX) = " + SqlLiteral(ArrayMerge(client_ids,"This",";"))+"
                DECLARE
                @client_ids AS TABLE(
                id BIGINT
                );
                INSERT INTO @client_ids
                SELECT value FROM string_split(@client_ids_str, ';');
		        ";
            projectsFilter += " 
                JOIN @client_ids clids ON clids.id = heps.client_id ";
        }
        if (project_ids != undefined) {
            projectsDeclare += "
			    DECLARE @project_ids_str NVARCHAR(MAX) = " + SqlLiteral(ArrayMerge(project_ids,"This",";"))+"
                DECLARE
                @project_ids AS TABLE(
                id BIGINT
                );
                INSERT INTO @project_ids
                SELECT value FROM string_split(@project_ids_str, ';');
		        ";
            projectsFilter += " 
                JOIN @project_ids prids ON prids.id = heps.project_id ";
        }
        if (subject_area_ids != undefined) {
            projectsDeclare += "
			    DECLARE @subject_area_ids_str NVARCHAR(MAX) = " + SqlLiteral(ArrayMerge(subject_area_ids,"This",";"))+"
                DECLARE
                @subject_area_ids AS TABLE(
                id BIGINT
                );
                INSERT INTO @subject_area_ids
                SELECT value FROM string_split(@subject_area_ids_str, ';');
		        ";
            projectsFilter += " 
                JOIN cc_subject_areas ccsa ON ccsa.history_experience_project_id=heps.id
                JOIN @subject_area_ids saids ON saids.id = ccsa.competence_id";
        }
        if (role_ids != undefined) {
            projectsDeclare += "
			    DECLARE @role_ids_str NVARCHAR(MAX) = " + SqlLiteral(ArrayMerge(role_ids,"This",";"))+"
                DECLARE
                @role_ids AS TABLE(
                id BIGINT
                );
                INSERT INTO @role_ids
                SELECT value FROM string_split(@role_ids_str, ';');
		        ";
            projectsFilter += " 
                JOIN cc_hist_exp_project_roles hepr ON hepr.history_experience_project_id=heps.id
                JOIN @role_ids rolids ON rolids.id = hepr.project_participant_role_id ";
        }
    }

    // Фильтр по education
    education = bodyObj.GetOptProperty("education");
    if (education != undefined) {
        type_ids = education.GetOptProperty("type_ids");
        institution_ids = education.GetOptProperty("institution_ids");
        spec_ids = education.GetOptProperty("spec_ids");

        educationFilter= "
            LEFT JOIN cc_educations ed ON ed.person_id=cs.id";
        
        if (type_ids != undefined) {
            educationDeclare += "
			    DECLARE @type_ids_str NVARCHAR(MAX) = " + SqlLiteral(ArrayMerge(type_ids,"This",";"))+"
                DECLARE
                @type_ids AS TABLE(
                id BIGINT
                );
                INSERT INTO @type_ids
                SELECT value FROM string_split(@type_ids_str, ';');
		        ";
            educationFilter += " 
                JOIN @type_ids edtids ON edtids.id = ed.education_type_id";
        }
        if (institution_ids != undefined) {
            educationDeclare += "
			    DECLARE @institution_ids_str NVARCHAR(MAX) = " + SqlLiteral(ArrayMerge(institution_ids,"This",";"))+"
                DECLARE
                @institution_ids AS TABLE(
                id NVARCHAR(MAX)
                );
                INSERT INTO @institution_ids
                SELECT value FROM string_split(@institution_ids_str, ';');
		        ";
            educationFilter += "  
                JOIN @institution_ids instids ON instids.id = ed.name";
        }
        if (spec_ids != undefined) {
            educationDeclare += "
			    DECLARE @spec_ids_str NVARCHAR(MAX) = " + SqlLiteral(ArrayMerge(spec_ids,"This",";"))+"
                DECLARE
                @spec_ids AS TABLE(
                id BIGINT
                );
                INSERT INTO @spec_ids
                SELECT value FROM string_split(@spec_ids_str, ';');
		        ";
            educationFilter += " 
                JOIN @spec_ids specids ON specids.id = ed.professional_area_id";
        }
    }

    // Фильтр по certificates
    certificates_data = bodyObj.GetOptProperty("certificates");
    if (certificates_data != undefined) {
        cert_names = certificates_data.GetOptProperty("cert_names");
        
        if (cert_names != undefined) {
            certificatesDeclare = "DECLARE @cert_names_str NVARCHAR(MAX) = " + SqlLiteral(ArrayMerge(cert_names,"This",";"))+"
                DECLARE
                @cert_names AS TABLE(
                    id NVARCHAR(MAX)
                );
                INSERT INTO @cert_names
                SELECT value FROM string_split(@cert_names_str, ';');";
            certificatesFilter="
                JOIN certificates certs ON certs.person_id=cs.id
                JOIN @cert_names certname ON certs.type_name LIKE '%' + certname.id + '%'";
        }
    }

    // Фильтр по hobbies
    hobby_data = bodyObj.GetOptProperty("hobbies");
    if (hobby_data != undefined) {
        hobby_ids = hobby_data.GetOptProperty("hobby_ids");
        if (hobby_ids != undefined) {
            hobbiesDeclare = "
                DECLARE @hobby_ids_str NVARCHAR(MAX) = " + SqlLiteral(ArrayMerge(hobby_ids,"This",";"))+";
                DECLARE @hobby_ids TABLE (id NVARCHAR(MAX));
                INSERT INTO @hobby_ids
                    SELECT value FROM string_split(@hobby_ids_str, ';');";

            hobbiesFilter = "
                JOIN resumes ress ON ress.person_id = cs.id
                JOIN resume resd ON resd.id = ress.id
                CROSS APPLY STRING_SPLIT(
                    resd.data.value('(resume/custom_elems/custom_elem[name=\"hobby\"]/value)[1]', 'NVARCHAR(MAX)'),
                    ';'
                ) AS split_val
                JOIN @hobby_ids hids ON LTRIM(RTRIM(split_val.value)) = hids.id";
        }
    }
}

// -------------------- OpenSearch: ранжирование (и опционально фильтрация) --------------------
var osIdsDeclare = "";
var osSeqDeclare = "";
var osFilter = "";
var osHitsMap = new Object();
var orderedIds = [];
var osRes = undefined;

arrKeywords = (arrKeywords != undefined) ? arrKeywords : [];

// Нужно отдать все id в OS: берём всех сотрудников с резюме и не тех.пользователей
var passAllIdsToOS = true;
var arrAllIds = undefined;

if (ArrayCount(arrKeywords) > 0) {
    if (passAllIdsToOS) {
        var allIdsSql = "sql: SELECT DISTINCT cs.id " +
            "FROM collaborators cs " +
            "JOIN resumes res ON res.person_id = cs.id " +
            "WHERE cs.role_id != 'tech_user' " + ((include_dismiss == true) ? "" : " AND cs.is_dismiss != 1");
        arrAllIds = ArrayExtract(XQuery(allIdsSql), "String(This.id)");
    } else {
        arrAllIds = undefined;
    }

    osRes = tools.call_code_library_method(
        "libOpenSearchAPI",
        "os_search_hybrid_flat",
        ["search_collaborators_distiluse_v2", arrKeywords, arrAllIds, search_fields]
        // если есть возможность — добавьте 5-й аргумент с {track_total_hits:true, k/size:...}
    );

    alert("OS hits: " + (osRes != undefined ? ArrayCount(osRes.hits) : 0));

    if (osRes != undefined && ArrayCount(osRes.hits) > 0) {
        orderedIds = ArrayExtract(osRes.hits, "String(This.id)");

        // нормализуем score (0..1) и заполним map
        minScore = 0;
        maxScore = ArrayMax(osRes.hits, "This.score").score;
        scoreRange = maxScore - minScore;
        if (scoreRange == 0) scoreRange = 1;
        for (hit in osRes.hits) {
            hit.score = (hit.score - minScore) / scoreRange;
            osHitsMap[hit.id] = hit;
        }

        // 1) Таблица @os_ids (для опциональной фильтрации множества)
        var osIdsStr = ArrayMerge(orderedIds, "This", ";");
        osIdsDeclare = "
            DECLARE @os_ids_str NVARCHAR(MAX) = " + SqlLiteral(osIdsStr) + ";
            DECLARE @os_ids TABLE (id BIGINT);
            INSERT INTO @os_ids
            SELECT TRY_CAST(value AS BIGINT)
            FROM string_split(@os_ids_str, ';')
            WHERE TRY_CAST(value AS BIGINT) IS NOT NULL;
        ";
        if (STRICT_OS_FILTER) {
            osFilter = " JOIN @os_ids osids ON osids.id = cs.id ";
        } else {
            osFilter = ""; // не пересекаем множество — OS только ранжирует
        }

        // 2) Таблица @os_ids_seq (для детерминированного порядка)
        // кодируем парой "id:seq"
        var seqPairs = [];
        var seqIndex = 0;
        for (oid in orderedIds) {
            seqPairs.push(String(oid) + ":" + String(seqIndex));
            seqIndex++;
        }
        var osSeqStr = ArrayMerge(seqPairs, "This", ";");
        osSeqDeclare = "
            DECLARE @os_ids_seq_str NVARCHAR(MAX) = " + SqlLiteral(osSeqStr) + ";
            DECLARE @os_ids_seq TABLE (id BIGINT, seq INT);
            ;WITH ss AS (
                SELECT value AS val
                FROM string_split(@os_ids_seq_str, ';')
            )
            INSERT INTO @os_ids_seq(id, seq)
            SELECT
                TRY_CAST(LEFT(val, CHARINDEX(':', val) - 1) AS BIGINT) AS id,
                TRY_CAST(SUBSTRING(val, CHARINDEX(':', val) + 1, 100) AS INT) AS seq
            FROM ss
            WHERE CHARINDEX(':', val) > 0
              AND TRY_CAST(LEFT(val, CHARINDEX(':', val) - 1) AS BIGINT) IS NOT NULL;
        ";
    } else {
        // OS ничего не вернул
        osIdsDeclare = "DECLARE @os_ids TABLE (id BIGINT);";
        osSeqDeclare = "DECLARE @os_ids_seq TABLE (id BIGINT, seq INT);";
        osFilter = STRICT_OS_FILTER ? " JOIN @os_ids osids ON 1 = 0 " : ""; // при строгом режиме вернёт пусто
        orderedIds = [];
    }
} else {
    // без ключевых слов
    osIdsDeclare = "DECLARE @os_ids TABLE (id BIGINT);";
    osSeqDeclare = "DECLARE @os_ids_seq TABLE (id BIGINT, seq INT);";
    osFilter = "";
}

// фиксированные параметры запроса которые всегда подставляются
// offset и next - параметры пейджирования
fixedDeclare = "
	DECLARE @offset INT = "+Int((OptInt(page_number,1)-1)*OptInt(page_size,0))+"; 
	DECLARE @next INT = "+OptInt(page_size,0)+"; 
    "+ searchDeclare
    + generalDeclare
    + locationDeclare
    + projectsDeclare
    + educationDeclare
    + certificatesDeclare
    + hobbiesDeclare
    + collaboratorsDeclare
    + osIdsDeclare
    + osSeqDeclare;

// Основной SQL: множество задаётся только SQL-фильтрами (+ опционально OS-фильтр, если STRICT_OS_FILTER=true)
fixedSelect = "
        SELECT DISTINCT
            cs.id as collaborator_id,
            ps.id,
            ps.code AS tab_code,
            cs.fullName,
            res.id AS resume_id,
            (
                SELECT TOP 1
                       '/download_file.html?file_id='
                       + CAST(f.x.value('(file_id)[1]', 'bigint') AS varchar(20))
                FROM resume rxml
                OUTER APPLY rxml.data.nodes('resume/files/file') AS f(x)
                WHERE rxml.id = res.id
            ) AS resume_url,

            ps.name AS positionName,
            subs.name AS subdivisionName,
            CASE 
                WHEN cs.birth_date IS NOT NULL THEN 
                    DATEDIFF(YEAR, cs.birth_date, GETDATE()) - 
                    CASE 
                        WHEN MONTH(GETDATE()) < MONTH(cs.birth_date) 
                            OR (MONTH(GETDATE()) = MONTH(cs.birth_date) AND DAY(GETDATE()) < DAY(cs.birth_date))
                        THEN 1 
                        ELSE 0 
                    END
            END AS age,
            CASE 
                WHEN cs.hire_date IS NOT NULL THEN 
                    DATEDIFF(YEAR, cs.hire_date, GETDATE()) - 
                    CASE 
                        WHEN MONTH(GETDATE()) < MONTH(cs.hire_date) 
                            OR (MONTH(GETDATE()) = MONTH(cs.hire_date) AND DAY(GETDATE()) < DAY(cs.hire_date))
                        THEN 1 
                        ELSE 0
                    END
            END AS experience,
            cs.hire_date,
            STUFF(( 
                SELECT DISTINCT ', ' + et.name
                FROM cc_educations ed
                JOIN education_types et ON ed.education_type_id = et.id
                WHERE ed.person_id = cs.id
                FOR XML PATH(''), TYPE
            ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS education,
            cs.pict_url,
            cs.is_dismiss AS is_dismiss,
            COUNT(DISTINCT p.id) AS projectsCount
        FROM collaborators cs
            JOIN positions ps ON ps.id = cs.position_id AND cs.role_id != 'tech_user' "+((include_dismiss==true)?"":" AND cs.is_dismiss != 1 ")+" 
            JOIN resumes res ON res.person_id = cs.id
            "+ osFilter +"
            "+ collaboratorsFilter +"
            "+ generalFilter +"
            "+ locationFilter +"
            "+ certificatesFilter +"
            "+ educationFilter +"
            JOIN subdivisions subs ON subs.id = ps.parent_object_id
            "+(projectsFilter != "" ?"":"LEFT ")+"JOIN cc_history_experience_projects heps ON heps.collaborator_id = cs.id and heps.is_ts_project = 1
            "+ projectsFilter +"
            "+ hobbiesFilter +"
            LEFT JOIN project p ON heps.project_id=p.id
			    AND (p.data.value('(//custom_elem[name=\"not_active_myprofile\"]/value)[1]', 'NVARCHAR(MAX)') IS NULL 
			    OR p.data.value('(//custom_elem[name=\"not_active_myprofile\"]/value)[1]', 'NVARCHAR(MAX)')='false')
            "+ searchFilter +"
        GROUP BY 
            ps.id,
            ps.code,
            res.id,
            cs.fullName,
            ps.name,
            subs.name,
            cs.birth_date,
            cs.hire_date,
            cs.pict_url,
            cs.is_dismiss,
            cs.id
";

// Собираем SQL
sql="sql:\n"+fixedDeclare+"\n"+fixedSelect;
alert("Поиск сотрудника:" + sql);

// SQL: отбор по фильтрам
allData = ArraySelectAll(XQuery(sql));

// Стабильный TOTAL: считаем по SQL-множеству (учтёт STRICT_OS_FILTER, если включен)
var allDistinctIds = ArraySelectDistinct(ArrayExtract(allData, "This.collaborator_id"));
var totalStable = ArrayCount(allDistinctIds);

// Удаляем дубликаты по collaborator_id
allData = ArraySelectDistinct(allData, "This.collaborator_id");

// -------------------- Сбор полного результата (без пагинации) --------------------
finalRes = [];

// Подготовка порядка
if (ArrayCount(arrKeywords) > 0) {
    // OS-упорядоченный список
    orderedIds = ArraySelectDistinct(orderedIds, "This");
} else {
    // без OS — порядок по SQL (потом сортировка ниже)
    orderedIds = ArrayExtract(allData, "String(This.collaborator_id)");
    orderedIds = ArraySelectDistinct(orderedIds, "This");
}

// Если OS только ранжирует (STRICT_OS_FILTER=false) — добавим в конец те, кого нет в OS.
var mergedOrderedIds = [];
var seenMap = new Object();
for (oid in orderedIds) {
    mergedOrderedIds.push(oid);
    seenMap[oid] = true;
}
if (!STRICT_OS_FILTER) {
    for (aid in allDistinctIds) {
        var sAid = String(aid);
        if (!seenMap.HasProperty(sAid)) {
            mergedOrderedIds.push(sAid);
            seenMap[sAid] = true;
        }
    }
} else {
    // строгое пересечение — используем только OS-набор
    mergedOrderedIds = orderedIds;
}

// Сбор объектов в соответствии с mergedOrderedIds
for (id in mergedOrderedIds) {
    row = ArrayOptFind(allData, "This.collaborator_id == " + id);
    if (row != undefined) {
        obj = row_to_obj(row);

        // OS-поля, если OS был и этот id там присутствует
        hit = (osHitsMap.HasProperty(id) ? osHitsMap[id] : undefined);
        if (hit != undefined) {
            // matched_queries - нормализованные категории
            normMatches = [];
            for (mq in hit.matched_queries) {
                norm = normalize_match_name(mq);
                if (ArrayOptFind(normMatches, "This == norm") == undefined) {
                    normMatches.push(norm);
                }
            }
            obj.match_places = normMatches;
            obj.hl_skills = hit.hl_skills;
            obj.hl_projects = hit.hl_projects;
            obj.hl_resume = hit.hl_resume;
            obj.score = Math.round(hit.score*100); // релевантность 0..100
        }
        else {
            // если OS не вызывался или id не попал в OS
            obj.score = (ArrayCount(arrKeywords) > 0 ? 0 : 100);
        }

        finalRes.push(obj);
    }
}

// Финальная де-дупликация
finalRes = ArraySelectDistinct(finalRes, "This.collaborator_id");

alert("finalRes "+ArrayCount(finalRes));

// -------------------- Сортировка --------------------
// Если сортируем по score:
// - при отсутствии ключевых слов сортируем по ФИО;
// - при наличии ключевых слов порядок уже соответствует OS (и добавленные хвосты следуют за ними).
if (sort_field == "score") {
    if (ArrayCount(arrKeywords) == 0) {
        finalRes = ArraySort(finalRes, "fullName", ((sort_direct == "DESC")?'-':'+'));
    } else {
        if (sort_direct == "DESC") {
            // перевернём только OS-часть сверху (сохраним хвост в конце)
            var osCount = ArrayCount(orderedIds);
            var head = ArrayRange(finalRes, 0, osCount);
            var tail = ArrayRange(finalRes, osCount, ArrayCount(finalRes) - osCount);
            head = ArraySort(head, "score", "-"); // DESC по score
            // добавим детерминированный тай-брейк внутри равных score
            // (fullName, collaborator_id)
            head = ArraySort(head, "fullName", "+");
            head = ArraySort(head, "collaborator_id", "+");
            finalRes = ArrayUnion(head, tail);
        } else {
            // ASC: оставим как есть — уже по релевантности
            // можно добавить тай-брейк:
            finalRes = ArraySort(finalRes, "collaborator_id", "+");
        }
    }
} else {
    // Любое другое поле сортируем явно
    finalRes = ArraySort(finalRes, sort_field, ((sort_direct == "DESC")?'-':'+'));
    // Дет. тай-брейк по id
    finalRes = ArraySort(finalRes, "collaborator_id", "+");
}

uniqueIds = ArraySelectDistinct(ArrayExtract(finalRes, "This.collaborator_id"));
alert("uniqueIds "+ArrayCount(uniqueIds));

// -------------------- Пагинация --------------------
offset = (OptInt(page_number,1)-1) * OptInt(page_size,0);
pagedRes = ArrayRange(finalRes, offset, OptInt(page_size,0));

// Лог
createLogMetrics();

alert("allData count " + ArrayCount(allData));
alert("orderedIds count " + ArrayCount(orderedIds));

// Результат
RESULT = ArraySelectAll(pagedRes);
PAGING.MANUAL = true;
PAGING.TOTAL = totalStable; // СТАБИЛЬНЫЙ TOTAL из SQL-множества
