function addLog(sMessageType, sMessage) {
    var sLogName = Param.log_file_name;
    EnableLog(sLogName, true);

    if (sMessageType == "ERROR" || sMessageType == "LIFECYCLE" || StrContains(Param.log_level, sMessageType)) {
        sMessage = (sMessageType ? (StrUpperCase(sMessageType) + ':\t') : '') + (sMessage ? sMessage : '');

        try {
            LogEvent(sLogName, sMessage);
        } catch (e) {
            LogEvent(sLogName, e);
        }
    }
}

function getHeaderStr() {
    var strHeader = "";
    var arrHeader = [];

    if (!IsEmptyValue(Param.credentials) && !IsEmptyValue(Param.x_app_id)) {
        arrHeader.push("Authorization: Basic " + Base64Encode(Param.credentials));
        arrHeader.push("x-app-id: " + Param.x_app_id);
        arrHeader.push("Ignore-Errors:1");
    }

    if (ArrayOptFirstElem(arrHeader) != undefined) {
        strHeader = ArrayMerge(arrHeader, "This", "\n");
    }

    return strHeader;
}

function deleteRecords(arrIdsRecordsToDelete, strHeader) {
    var idsToDelete = ArrayExtract(arrIdsRecordsToDelete, "({id: RValue(This.id)})");
    var objRestFields = new Object();
    objRestFields.arrDeleteIDs = idsToDelete;
    var strBody = tools.object_to_text(objRestFields, "json");
    addLog("DEBUG", "deleteRecords (strBody) = " + strBody);

    //var deleteResponse = HttpRequest("http://test-websoft-ext.axapta.local/oapi/WS_INT_TO_WS_EXT_INTEGRATIONS/deleteRecords", "post", strBody, strHeader);
    var deleteResponse = HttpRequest("https://tsheet.gmcs.ru/oapi/WS_INT_TO_WS_EXT_INTEGRATIONS/deleteRecords", "post", strBody, strHeader);

    if (deleteResponse.RespCode != 200) {
        addLog("WARN", "Не удалось удалить записи с внешнего сервера WebSoft Ext, код ответа: " + deleteResponse.RespCode);
    }
}

/* =========================
   Вспомогательные функции
   ========================= */

function escapeSqlString(s) {
    return StrReplace(String(s), "'", "''");
}

function setCustomElemValue(topElem, name, value) {
    var ce = ArrayOptFind(topElem.custom_elems, 'This.name == name');
    if (ce == undefined) {
        ce = topElem.custom_elems.AddChild();
        ce.name = name;
    }
    ce.value = value;
}

/**
 * Поиск уволенного сотрудника в catalog collaborator
 * Приоритеты:
 * 1) ФИО + год рождения
 * 2) Фамилия + Имя + год рождения
 * 3) Фамилия + Имя + Отчество
 * 4) Фамилия + Имя
 * 5) vk_id (кастомный элемент)
 *
 * Возвращает объект: { id, black_label, member_group_vk } или undefined
 */
function checkCollaborator(vk_id, lastname, firstname, middlename, birth_year) {
    var oCollab;
    var searchLevels = [];
    var hasValidData = false;

    var ln = !IsEmptyValue(lastname) ? Trim(lastname) : "";
    var fn = !IsEmptyValue(firstname) ? Trim(firstname) : "";
    var mn = !IsEmptyValue(middlename) ? Trim(middlename) : "";
    var by = !IsEmptyValue(birth_year) ? String(birth_year) : "";

    if (IsEmptyValue(ln) && IsEmptyValue(fn) && IsEmptyValue(vk_id)) {
        addLog("WARN", "Недостаточно данных для поиска сотрудника");
        return undefined;
    }

    var selPrefix =
        "sql: SELECT TOP 1 " +
        "  c.id, " +
        "  CASE WHEN c.data.exist('/collaborator/custom_elems/custom_elem[name=\"black_label\" and (lower-case(value) = \"true\" or value = \"1\")]') = 1 THEN 1 ELSE 0 END AS black_label, " +
        "  CASE WHEN c.data.exist('/collaborator/custom_elems/custom_elem[name=\"member_group_vk\" and (lower-case(value) = \"true\" or value = \"1\")]') = 1 THEN 1 ELSE 0 END AS member_group_vk " +
        "FROM collaborator AS c " +
        "JOIN collaborators AS cl ON cl.id = c.id " +
        "WHERE cl.is_dismiss = 1 AND ";

    // Уровень 1: ФИО + год рождения
    if (!IsEmptyValue(ln) && !IsEmptyValue(fn) && !IsEmptyValue(mn) && !IsEmptyValue(by)) {
        var fullname1 = escapeSqlString(ln + " " + fn + " " + mn);
        var cond1 = "cl.fullname = '" + fullname1 + "' AND YEAR(cl.birth_date) = " + by;
        searchLevels.push(cond1);
        hasValidData = true;
        addLog("DEBUG", "Уровень 1: ФИО+год " + fullname1 + ", " + by);
    }

    // Уровень 2: Фамилия + Имя + год (отчество допускаем через LIKE)
    if (!IsEmptyValue(ln) && !IsEmptyValue(fn) && !IsEmptyValue(by)) {
        var fullname2 = escapeSqlString(ln + " " + fn);
        var cond2 = "cl.fullname LIKE '" + fullname2 + "%' AND YEAR(cl.birth_date) = " + by;
        searchLevels.push(cond2);
        hasValidData = true;
        addLog("DEBUG", "Уровень 2: ФИ+год " + fullname2 + ", " + by);
    }

    // Уровень 3: ФИО без года
    if (!IsEmptyValue(ln) && !IsEmptyValue(fn) && !IsEmptyValue(mn)) {
        var fullname3 = escapeSqlString(ln + " " + fn + " " + mn);
        var cond3 = "cl.fullname = '" + fullname3 + "'";
        searchLevels.push(cond3);
        hasValidData = true;
        addLog("DEBUG", "Уровень 3: ФИО " + fullname3);
    }

    // Уровень 4: ФИ без года
    if (!IsEmptyValue(ln) && !IsEmptyValue(fn)) {
        var fullname4 = escapeSqlString(ln + " " + fn);
        var cond4 = "cl.fullname LIKE '" + fullname4 + "%'";
        searchLevels.push(cond4);
        hasValidData = true;
        addLog("DEBUG", "Уровень 4: ФИ " + fullname4);
    }

    // Уровень 5: По vk_id (кастомный элемент)
    if (!IsEmptyValue(vk_id)) {
        var vk = escapeSqlString(vk_id);
        var cond5 = "c.data.exist('/collaborator/custom_elems/custom_elem[name=\"vk_id\" and value=\"" + vk + "\"]') = 1";
        searchLevels.push(cond5);
        hasValidData = true;
        addLog("DEBUG", "Уровень 5: vk_id = " + vk_id);
    }

    if (!hasValidData || ArrayCount(searchLevels) == 0) {
        addLog("WARN", "Недостаточно данных для поиска сотрудника");
        return undefined;
    }

    for (var i = 0; i < ArrayCount(searchLevels); i++) {
        currentCond = searchLevels[i];
        sql = selPrefix + currentCond;

        addLog("DEBUG", "Выполнение поиска уровня " + (i + 1) + ": " + sql);

        oCollab = ArrayOptFirstElem(tools.xquery(sql));
        if (oCollab != undefined) {
            addLog("DEBUG", "Найден collaborator id=" + oCollab.id + " на уровне " + (i + 1));
            return oCollab;
        }
    }

    addLog("DEBUG", "Сотрудник не найден ни на одном уровне поиска");
    return undefined;
}

function getRecordVkData(code) {
    var docRecord, iID;

    if (!IsEmptyValue(code)) {
        docRecord = ArrayOptFirstElem(tools.xquery("for $elem in cc_vkbot_ws_int_integrations where $elem/vk_id = " + XQueryLiteral(code) + " return $elem"));
        if (docRecord != undefined) {
            iID = docRecord.PrimaryKey.Value;
            docRecord = tools.open_doc(iID);
        } else {
            docRecord = undefined;
        }
    }
    return docRecord;
}

function setInfoVkBotData(id, surname, nameOnly, secondName, birthYear, vkId, cellularPhone, email, telegram, status) {
    var oRes = { success: false, message: "" };

    if (tools_library.string_is_null_or_empty(vkId)) {
        oRes.message = "Ошибка: поле vk_id обязательно";
        return oRes;
    }

    var docRecord = getRecordVkData(vkId);
    var iResType;

    if (docRecord != undefined) {
        iResType = 0; // Обновление
    } else {
        docRecord = tools.new_doc_by_name("cc_vkbot_ws_int_integration");
        docRecord.BindToDb(DefaultDb);
        iResType = 1; // Создание
    }

    var topElem = docRecord.TopElem;
    if (!IsEmptyValue(id)) topElem.code = String(id);
    if (!IsEmptyValue(surname)) topElem.lastname = String(surname);
    if (!IsEmptyValue(nameOnly)) topElem.firstname = String(nameOnly);
    if (!IsEmptyValue(secondName)) topElem.middlename = String(secondName);
    if (!IsEmptyValue(birthYear)) topElem.birth_year = String(birthYear);
    if (!IsEmptyValue(vkId)) topElem.vk_id = String(vkId);
    if (!IsEmptyValue(cellularPhone)) topElem.phone = String(cellularPhone);
    if (!IsEmptyValue(email)) topElem.email = String(email);
    if (!IsEmptyValue(telegram)) topElem.telegram = String(telegram);
    if (!IsEmptyValue(status)) topElem.notification_status = status;

    docRecord.Save();

    oRes.success = true;
    oRes.message = iResType == 1 ? "Запись успешно создана" : "Запись успешно обновлена";
    return oRes;
}

/**
 * Является ли запись только с контактными данными
 */
function isContactDataOnlyRecord(record) {
    return !IsEmptyValue(record.vk_id) &&
        IsEmptyValue(record.lastname) &&
        IsEmptyValue(record.firstname) &&
        IsEmptyValue(record.middlename) &&
        IsEmptyValue(record.birth_year) &&
        (!IsEmptyValue(record.phone) || !IsEmptyValue(record.email) || !IsEmptyValue(record.telegram));
}

/**
 * Отправка уведомления на внешний сервер
 */
function sendNotification(objRestFields, strHeader, vk_id) {
    //var notifyResponse = HttpRequest("http://test-websoft-ext.axapta.local/oapi/WS_INT_TO_WS_EXT_INTEGRATIONS/sendNotificationToApi", "post", tools.object_to_text(objRestFields, "json"), strHeader);
    var notifyResponse = HttpRequest("https://tsheet.gmcs.ru/oapi/WS_INT_TO_WS_EXT_INTEGRATIONS/sendNotificationToApi", "post", tools.object_to_text(objRestFields, "json"), strHeader);

    if (notifyResponse.RespCode != 200) {
        addLog("WARN", "Не удалось отправить уведомление на внешний сервер WebSoft Ext для vk_id " + vk_id + ", код ответа: " + notifyResponse.RespCode);
        return false;
    }

    addLog("DEBUG", "notifyResponse: " + tools.object_to_text(notifyResponse.Body, "json"));
    return true;
}

function Main() {
    var strHeader = getHeaderStr();

    addLog("DEBUG", "Header = " + strHeader);

    if (IsEmptyValue(strHeader)) {
        addLog("ERROR", "Не заданы параметры авторизации в агенте");
        return;
    }

    //var getNewRecords = HttpRequest("http://test-websoft-ext.axapta.local/oapi/WS_INT_TO_WS_EXT_INTEGRATIONS/getNewRecords", "post", null, strHeader);
    var getNewRecords = HttpRequest("https://tsheet.gmcs.ru/oapi/WS_INT_TO_WS_EXT_INTEGRATIONS/getNewRecords", "post", null, strHeader);

    if (getNewRecords.RespCode != 200) {
        addLog("ERROR", "Не удалось получить записи, код ответа " + getNewRecords.RespCode);
        return;
    }

    addLog("DEBUG", "getNewRecords = " + tools.object_to_text(getNewRecords.Body, 'json'));

    var bodyObj = undefined;
    if (getNewRecords.Body != "") {
        bodyObj = tools.read_object(getNewRecords.Body);
    }

    var arrRecords = bodyObj.GetOptProperty('result');

    if (ArrayCount(arrRecords) == 0) {
        addLog("INFO", "Записи сотрудников отсутствуют на внешнем сервере WebSoft Ext для проверки");
        return;
    }

    for (record in arrRecords) {
        // Запись только с контактными данными
        if (isContactDataOnlyRecord(record)) {
            addLog("DEBUG", "Обработка записи только с контактными данными для vk_id: " + record.vk_id);

            var intRecord = getRecordVkData(record.vk_id);

            if (intRecord != undefined && intRecord.TopElem.notification_status.Value == "no black mark") {
                addLog("DEBUG", "Найдена предыдущая запись с 'no black mark', сохраняем контакты без отправки уведомления");

                // Ищем уволенного сотрудника по vk_id среди collaborator
                var staffRecordByVkId = checkCollaborator(record.vk_id, "", "", "", "");

                if (staffRecordByVkId != undefined) {
                    docStaff = tools.open_doc(OptInt(staffRecordByVkId.id), 0);
                    if (docStaff != undefined) {
                        var teStaff = docStaff.TopElem;

                        // Обновим контакты в custom_elems (замените на стандартные поля, если нужно)
                        if (!IsEmptyValue(record.phone))    setCustomElemValue(teStaff, "phone", record.phone);
                        if (!IsEmptyValue(record.email))    setCustomElemValue(teStaff, "email", record.email);
                        if (!IsEmptyValue(record.telegram)) setCustomElemValue(teStaff, "telegram", record.telegram);

                        // Отметим, что состоит в группе VK
                        setCustomElemValue(teStaff, "member_group_vk", true);

                        docStaff.Save();
                        addLog("DEBUG", "Контактные данные обновлены в collaborator id: " + docStaff.DocID);
                    }
                }

                // Обновляем запись интеграции (без уведомления)
                var res = setInfoVkBotData(record.id, "", "", "", "", record.vk_id, record.phone, record.email, record.telegram, "");
                if (!res.success) {
                    addLog("WARN", "Не удалось сохранить контактные данные для vk_id " + record.vk_id + ": " + res.message);
                }
            }
        } else {
            // Полная запись
            staffRecord = checkCollaborator(record.vk_id, record.lastname, record.firstname, record.middlename, record.birth_year);
            intRecord = getRecordVkData(record.vk_id);

            objRestFields = new Object();

            if (staffRecord == undefined) {
                // Сотрудник не найден
                addLog("DEBUG", "Сотрудник не найден среди уволенных collaborator");

                if (intRecord != undefined && intRecord.TopElem.notification_status.Value == "not found") {
                    objRestFields.vk_id = String(record.vk_id);
                    objRestFields.notification = "not found again";
                } else {
                    objRestFields.vk_id = String(record.vk_id);
                    objRestFields.notification = "not found";
                }

                // Создание/обновление интеграционной записи
                var resNF = setInfoVkBotData(record.id, record.lastname, record.firstname, record.middlename, record.birth_year, record.vk_id, "", "", "", objRestFields.notification);
                if (!resNF.success) {
                    addLog("WARN", "Не удалось сохранить запись для vk_id " + record.vk_id + ": " + resNF.message);
                }

                // Уведомление
                sendNotification(objRestFields, strHeader, record.vk_id);

            } else {
                addLog("DEBUG", "Сотрудник найден (collaborator)");

                objRestFields.vk_id = String(record.vk_id);
                objRestFields.notification = tools_web.is_true(staffRecord.black_label) ? "black mark" : "no black mark";

                if (objRestFields.notification == "no black mark") {
                    if (tools_web.is_true(staffRecord.member_group_vk)) {
                        objRestFields.notification = "already consists";
                        addLog("INFO", "Сотрудник с vk_id " + record.vk_id + " уже состоит в группе VK");
                    }
                }

                
                resOK = setInfoVkBotData(record.id, record.lastname, record.firstname, record.middlename, record.birth_year, record.vk_id, "", "", "", objRestFields.notification);
                if (!resOK.success) {
                    addLog("WARN", "Не удалось сохранить запись для vk_id " + record.vk_id + ": " + resOK.message);
                }

                // Уведомление
                sendNotification(objRestFields, strHeader, record.vk_id);

                // Если нет "черной метки" — сохраним vk_id в карточку сотрудника (custom_elems)
                if (!tools_web.is_true(staffRecord.black_label)) {
                    docStaff = tools.open_doc(OptInt(staffRecord.id), 0);
                    if (docStaff != undefined) {
                        teStaff = docStaff.TopElem;
                        setCustomElemValue(teStaff, "vk_id", String(record.vk_id));
                        docStaff.Save();
                    } else {
                        addLog("WARN", "Не удалось открыть collaborator для сохранения vk_id");
                    }
                }
            }
        }
    }

    // Удаление полученных данных с внешнего сервера WebSoft Ext
    deleteRecords(arrRecords, strHeader);
}

try {
    addLog("LIFECYCLE", "Начало работы агента");
    Main();
    addLog("LIFECYCLE", "Завершение работы агента");
} catch (ex) {
    addLog("ERROR", "Завершено с ошибкой: " + ex);
}