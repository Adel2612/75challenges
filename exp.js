function addLog(sMessageType, sMessage) {
    var sLogName = Param.log_file_name;
    EnableLog(sLogName, true);

    if(sMessageType == "ERROR" || sMessageType == "LIFECYCLE" || StrContains(Param.log_level, sMessageType)) {
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
        strHeader = ArrayMerge(arrHeader,"This", "\n");
    }

    return strHeader;
}

function deleteRecords(arrIdsRecordsToDelete, strHeader) {
    // Удаление полученных записей из WebSoft Ext
    var idsToDelete = ArrayExtract(arrIdsRecordsToDelete, "({id: RValue(This.id)})");
    var objRestFields = new Object();
    objRestFields.arrDeleteIDs = idsToDelete;
    var strBody = tools.object_to_text(objRestFields, "json");
    addLog("DEBUG", "deleteRecords (strBody) = " + strBody);

    var deleteResponse = HttpRequest("http://test-websoft-ext.axapta.local/oapi/WS_INT_TO_WS_EXT_INTEGRATIONS/deleteRecords", "post", strBody, strHeader);
    //var deleteResponse = HttpRequest("https://tsheet.gmcs.ru/oapi/WS_INT_TO_WS_EXT_INTEGRATIONS/deleteRecords", "post", strBody, strHeader);

    if (deleteResponse.RespCode != 200) {
        addLog("WARN", "Не удалось удалить записи с внешнего сервера WebSoft Ext, код ответа: " + deleteResponse.RespCode);
    }
}

/**
 * Функция для поиска сотрудника в таблице cc_history_dismissed_staffs
 * Реализует многоуровневый поиск с приоритетами:
 * 1. По ФИО и году рождения
 * 2. По фамилии, имени и году рождения
 * 3. По фамилии, имени и отчеству
 * 4. По фамилии и имени
 * 5. По vk_id (если предоставлен)
 * 
 * @param {string} vk_id - ID пользователя ВКонтакте
 * @param {string} lastname - Фамилия
 * @param {string} firstname - Имя
 * @param {string} middlename - Отчество
 * @param {string} birth_year - Дата рождения (год)
 * @returns {object} - Результат SQL запроса или undefined если не найден
 */
function checkArchiveCollaborator(vk_id, lastname, firstname, middlename, birth_year) {
    var oArchiveCollaborator;
    var searchLevels = [];
    var hasValidData = false;

    // Подготовка данных для поиска
    var cleanLastname = !IsEmptyValue(lastname) ? Trim(lastname) : "";
    var cleanFirstname = !IsEmptyValue(firstname) ? Trim(firstname) : "";
    var cleanMiddlename = !IsEmptyValue(middlename) ? Trim(middlename) : "";
    var cleanBirthYear = !IsEmptyValue(birth_year) ? String(birth_year) : "";

    // Проверяем наличие минимальных данных для поиска
    if (IsEmptyValue(cleanLastname) && IsEmptyValue(cleanFirstname) && IsEmptyValue(vk_id)) {
        addLog("WARN", "Недостаточно данных для выполнения поиска бывшего сотрудника");
        return undefined;
    }

    // Уровень 1: Поиск по ФИО и году рождения
    if (!IsEmptyValue(cleanLastname) && !IsEmptyValue(cleanFirstname) && !IsEmptyValue(cleanMiddlename) && !IsEmptyValue(cleanBirthYear)) {
        var fullName = cleanLastname + " " + cleanFirstname + " " + cleanMiddlename;
        var condition1 = "history_staff_fullname LIKE '" + fullName + "' AND YEAR(birth_date) = " + cleanBirthYear;
        searchLevels.push(condition1);
        hasValidData = true;
        addLog("DEBUG", "Уровень 1: Поиск по ФИО и году рождения - " + fullName + ", " + cleanBirthYear);
    }

    // Уровень 2: Поиск по фамилии, имени и году рождения
    if (!IsEmptyValue(cleanLastname) && !IsEmptyValue(cleanFirstname) && !IsEmptyValue(cleanBirthYear)) {
        var nameWithBirth = cleanLastname + " " + cleanFirstname;
        var condition2 = "history_staff_fullname LIKE '" + nameWithBirth + "' AND YEAR(birth_date) = " + cleanBirthYear;
        searchLevels.push(condition2);
        hasValidData = true;
        addLog("DEBUG", "Уровень 2: Поиск по фамилии, имени и году рождения - " + nameWithBirth + ", " + cleanBirthYear);
    }

    // Уровень 3: Поиск по фамилии, имени и отчеству
    if (!IsEmptyValue(cleanLastname) && !IsEmptyValue(cleanFirstname) && !IsEmptyValue(cleanMiddlename)) {
        var fullNameNoBirth = cleanLastname + " " + cleanFirstname + " " + cleanMiddlename;
        var condition3 = "history_staff_fullname LIKE '" + fullNameNoBirth + "'";
        searchLevels.push(condition3);
        hasValidData = true;
        addLog("DEBUG", "Уровень 3: Поиск по фамилии, имени и отчеству - " + fullNameNoBirth);
    }

    // Уровень 4: Поиск по фамилии и имени
    if (!IsEmptyValue(cleanLastname) && !IsEmptyValue(cleanFirstname)) {
        var nameOnly = cleanLastname + " " + cleanFirstname;
        var condition4 = "history_staff_fullname LIKE '" + nameOnly + "'";
        searchLevels.push(condition4);
        hasValidData = true;
        addLog("DEBUG", "Уровень 4: Поиск по фамилии и имени - " + nameOnly);
    }

    // Уровень 5: Поиск по vk_id (если предоставлен)
    if (!IsEmptyValue(vk_id)) {
        var condition5 = "vk_id = '" + vk_id + "'";
        searchLevels.push(condition5);
        hasValidData = true;
        addLog("DEBUG", "Уровень 5: Поиск по vk_id - " + vk_id);
    }

    // Проверяем, есть ли условия для поиска
    if (!hasValidData || ArrayCount(searchLevels) == 0) {
        addLog("WARN", "Недостаточно данных для выполнения поиска бывшего сотрудника");
        return undefined;
    }

    // Выполняем последовательный поиск по уровням
    for (i = 0; i < ArrayCount(searchLevels); i++) {
        currentCondition = searchLevels[i];
        sqlQuery = "sql: SELECT id, black_label, member_group_vk FROM cc_history_dismissed_staffs WHERE " + currentCondition;
        
        addLog("DEBUG", "Выполнение поиска уровня " + (i + 1) + ": " + sqlQuery);
        
        oArchiveCollaborator = ArrayOptFirstElem(tools.xquery(sqlQuery));
        
        if (oArchiveCollaborator != undefined) {
            addLog("DEBUG", "Найдена запись на уровне " + (i + 1) + " с ID: " + oArchiveCollaborator.id);
            return oArchiveCollaborator;
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
 * Функция для проверки, является ли запись только с контактными данными
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
 * Функция для отправки уведомления на внешний сервер
 */
function sendNotification(objRestFields, strHeader, vk_id) {
    var notifyResponse = HttpRequest("http://test-websoft-ext.axapta.local/oapi/WS_INT_TO_WS_EXT_INTEGRATIONS/sendNotificationToApi", "post", tools.object_to_text(objRestFields, "json"), strHeader);
    //var notifyResponse = HttpRequest("https://tsheet.gmcs.ru/oapi/WS_INT_TO_WS_EXT_INTEGRATIONS/sendNotificationToApi", "post", tools.object_to_text(objRestFields, "json"), strHeader);

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

    var getNewRecords = HttpRequest("http://test-websoft-ext.axapta.local/oapi/WS_INT_TO_WS_EXT_INTEGRATIONS/getNewRecords", "post", null, strHeader);
    //var getNewRecords = HttpRequest("https://tsheet.gmcs.ru/oapi/WS_INT_TO_WS_EXT_INTEGRATIONS/getNewRecords", "post", null, strHeader);

    if (getNewRecords.RespCode != 200) {
        addLog("ERROR", "Не удалось получить записи, код ответа " + getNewRecords.RespCode);
        return;
    }

    addLog("DEBUG", "getNewRecords = " + tools.object_to_text(getNewRecords.Body, 'json'));

    var bodyObj = undefined;
    if (getNewRecords.Body != ""){
        bodyObj = tools.read_object(getNewRecords.Body);
    }

    var arrRecords = bodyObj.GetOptProperty('result');

    if (ArrayCount(arrRecords) == 0) {
        addLog("INFO", "Записи бывших сотрудников отсутствуют на внешнем сервере WebSoft Ext для проверки");
        return;
    }

    for (record in arrRecords) {
        // Проверяем, является ли это записью только с контактными данными
        if (isContactDataOnlyRecord(record)) {
            addLog("DEBUG", "Обработка записи только с контактными данными для vk_id: " + record.vk_id);

            // Проверяем, отправлялось ли ранее уведомление "no black mark" для этого vk_id
            intRecord = getRecordVkData(record.vk_id);

            if (intRecord != undefined && intRecord.TopElem.notification_status.Value == "no black mark") {
                addLog("DEBUG", "Найдена предыдущая запись с 'no black mark', сохраняем контактные данные без отправки уведомления");

                // Ищем архивного сотрудника по vk_id
                staffRecordByVkId = checkArchiveCollaborator(record.vk_id, "", "", "", "");

                if (staffRecordByVkId != undefined) {
                    // Обновляем контактные данные в cc_history_dismissed_staffs
                    docStaff = tools.open_doc(OptInt(staffRecordByVkId.id), 0);

                    if (docStaff != undefined) {
                        teStaff = docStaff.TopElem;
                        if (!IsEmptyValue(record.phone)) teStaff.history_staff_phone = record.phone;
                        if (!IsEmptyValue(record.email)) teStaff.history_staff_email = record.email;
                        if (!IsEmptyValue(record.telegram)) teStaff.telegram = record.telegram;

                        teStaff.member_group_vk = true;

                        docStaff.Save();
                        addLog("DEBUG", "Контактные данные обновлены в карточке архивного сотрудника с ID: " + docStaff.DocID);
                    }
                }

                // Обновляем запись в vkbot_ws_int_integrations
                res = setInfoVkBotData(record.id, "", "", "", "", record.vk_id, record.phone, record.email, record.telegram, "");
                if (!res.success) {
                    addLog("WARN", "Не удалось сохранить контактные данные для vk_id " + record.vk_id + ": " + res.message);
                }
            }
        } else {
            // Обычная обработка записи с полными данными
            staffRecord = checkArchiveCollaborator(record.vk_id, record.lastname, record.firstname, record.middlename, record.birth_year);
            intRecord = getRecordVkData(record.vk_id);

            objRestFields = new Object();

            if (staffRecord == undefined) {
                // Сотрудник не найден
                addLog("DEBUG", "Бывший сотрудник не найден");

                if (intRecord != undefined && intRecord.TopElem.notification_status.Value == "not found") {
                    objRestFields.vk_id = String(record.vk_id);
                    objRestFields.notification = "not found again";
                } else {
                    objRestFields.vk_id = String(record.vk_id);
                    objRestFields.notification = "not found";
                }

                // Создание или обновление записи
                res = setInfoVkBotData(record.id, record.lastname, record.firstname, record.middlename, record.birth_year, record.vk_id, "", "", "", objRestFields.notification);

                if (!res.success) {
                    addLog("WARN", "Не удалось сохранить запись для vk_id " + record.vk_id + ": " + res.message);
                }

                // Отправляем уведомление
                sendNotification(objRestFields, strHeader, record.vk_id);

            } else {
                addLog("DEBUG", "Бывший сотрудник найден");
                objRestFields.vk_id = String(record.vk_id);
                objRestFields.notification = tools_web.is_true(staffRecord.black_label) ? "black mark" : "no black mark";

                if (objRestFields.notification == "no black mark") {
                    if (tools_web.is_true(staffRecord.member_group_vk)) {
                        objRestFields.notification = "already consists";
                        addLog("INFO", "Сотрудник с vk_id " + record.vk_id + " уже состоит в группе VK");
                    }
                }
                // Создание или обновление записи
                res = setInfoVkBotData(record.id, record.lastname, record.firstname, record.middlename, record.birth_year, record.vk_id, "", "", "", objRestFields.notification);

                if (!res.success) {
                    addLog("WARN", "Не удалось сохранить запись для vk_id " + record.vk_id + ": " + res.message);
                }

                // Отправляем уведомление
                sendNotification(objRestFields, strHeader, record.vk_id);

                if (!tools_web.is_true(staffRecord.black_label)) {
                    // Обновление контактных данных в cc_history_dismissed_staffs
                    docStaff = tools.open_doc(OptInt(staffRecord.id), 0);
                    if (docStaff != undefined) {
                        teStaff = docStaff.TopElem;
                        teStaff.vk_id = record.vk_id;
                        docStaff.Save();
                    } else {
                        addLog("WARN", "Не удалось открыть карточку архивного сотрудника для сохранения контактных данных");
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