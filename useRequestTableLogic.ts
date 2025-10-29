import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Dayjs } from 'dayjs';

import { ColumnsType } from 'antd/es/table';

import { ICollaboratorExtended } from '../components/EmployeeTable/models/EmployeeTable.models';

import { useRequest } from '@src/app/hooks/useRequest.hook';

import { IApiResponse } from '@src/app/models/type';

import { IConcordant } from '../models/UserRequest.model';

import { ListReqConfig } from '@src/app/utilities/api/AxiosApi.config';
import { HttpMethods } from '@src/app/utilities/constants/HttpMethods.constant';

export interface IUserRequest {
	id: string;
	code: string;
	create_date: string;
	modification_date: string;
	type_name: string;
	person_fullname: string;
	person_image?: string;
	object_name?: string;
	object_image?: string;
	workflow_state_name: string;
	status_name: string;
}

export interface IUserStatusFilter {
	id: string;
	name: string;
}

export interface IUserTypeFilter {
	id: string;
	name: string;
}

export interface IUserDepartamentFilter {
	id: string;
	name: string;
}

export interface ISystem {
	id: string;
	name: string;
}
export type UzDateRange = [Dayjs | null, Dayjs | null];
export interface IFilters {
	types: string[];
	statuses: string[];
	concordant: string[];
	departament: string[];
	roles: string[];
	project: string[];
	appointmentType: string[];
	system: string[];
	searchText: string;

	uzDateRange: UzDateRange;
	initiators: string[];
	observers: string[];
	states: string[];
	executors: string[];
}

const ROLE_TABS_CONFIG: Record<string, Array<{ key: string; title: string }>> = {
	collaborator: [
		{ key: 'onUserRequests', title: 'Заявки на меня' },
		{ key: 'observeRequests', title: 'Я наблюдаю' },
	],
	subdivision_manager: [
		{ key: 'userRequests', title: 'Созданные мной' },
		{ key: 'subordinatesRequests', title: 'Заявки моих подчиненных' },
		{ key: 'observeRequests', title: 'Я наблюдаю' },
		{ key: 'curentFlow', title: 'Подключенные сотрудники' },
	],
	team_manager: [
		{ key: 'userRequests', title: 'Созданные мной' },
		{ key: 'subordinatesRequests', title: 'Заявки моих подчиненных' },
		{ key: 'observeRequests', title: 'Я наблюдаю' },
		{ key: 'curentFlow', title: 'Подключенные сотрудники' },
	],
	project_manager: [
		{ key: 'userRequests', title: 'Созданные мной' },
		{ key: 'subordinatesRequests', title: 'Заявки моих подчиненных' },
		{ key: 'observeRequests', title: 'Я наблюдаю' },
		{ key: 'curentFlow', title: 'Подключенные сотрудники' },
	],
	admin: [
		{ key: 'userRequests', title: 'Созданные мной' },
		{ key: 'allRequests', title: 'Все заявки' },
		{ key: 'processedRequests', title: 'Обработанные' },
		{ key: 'processedByGroupRequests', title: 'Обработанные группой' },
		{ key: 'observeRequests', title: 'Я наблюдаю' },
		{ key: 'curentFlow', title: 'Подключенные сотрудники' },
	],
	confirmer: [
		{ key: 'confirmRequests', title: 'Требуют согласования' },
		{ key: 'processedRequests', title: 'Обработанные' },
		{ key: 'processedByGroupRequests', title: 'Обработанные группой' },
		{ key: 'observeRequests', title: 'Я наблюдаю' },
		{ key: 'curentFlow', title: 'Подключенные сотрудники' },
	],
	hr: [
		{ key: 'userRequests', title: 'Созданные мной' },
		{ key: 'allRequests', title: 'Все заявки' },
		{ key: 'processedRequests', title: 'Обработанные' },
		{ key: 'processedByGroupRequests', title: 'Обработанные группой' },
		{ key: 'observeRequests', title: 'Я наблюдаю' },
		{ key: 'curentFlow', title: 'Подключенные сотрудники' },
	],
	substitutor: [
		{ key: 'userRequests', title: 'Созданные мной' },
		{ key: 'subordinatesRequests', title: 'Заявки моих подчиненных' },
		{ key: 'observeRequests', title: 'Я наблюдаю' },
		{ key: 'curentFlow', title: 'Подключенные сотрудники' },
	],
	office_manager: [
		{ key: 'userRequests', title: 'Созданные мной' },
		{ key: 'processedRequests', title: 'Обработанные' },
		{ key: 'confirmRequests', title: 'Требуют согласования' },
	],
};

export interface UseRequestTableLogicResult {
	userRole: string | null;
	activeTab: string;
	setActiveTab: (tab: string) => void;
	currentRoleTabs: Array<{ key: string; title: string }>;
	loading: boolean;
	data: IUserRequest[];
	columns: ColumnsType<IUserRequest>;
	filters: IFilters;
	setFilter: <K extends keyof IFilters>(filter: K, value: IFilters[K]) => void;
	handleRoleChange: (role: string) => void;
	viewMode: string;
	dateRange: [Dayjs | null, Dayjs | null];
	setViewMode: (mode: string) => void;
	setDateRange: (range: [Dayjs | null, Dayjs | null]) => void;
	userTypes: IUserTypeFilter[];
	userStatuses: IUserStatusFilter[];
	userConcordant: IConcordant[];
	userProject: IUserStatusFilter[];
	userAppointmentType: IUserStatusFilter[];
	userDepartments: IUserDepartamentFilter[];
	userRoles: IUserStatusFilter[];
	userSystem: ISystem[];
	userInitiators: IConcordant[];
	userObservers: IConcordant[];
	userStates: { state_code: string; state_name: string }[];
	employees: ICollaboratorExtended[];
	employeesPage: number;
	userExecutors: IConcordant[];

	employeesPageSize: number;
	totalEmployees: number;
	setEmployeesPage: (page: number) => void;
	setEmployeesPageSize: (size: number) => void;
	setData: (data: IUserRequest[]) => void;

	requestsPage: number;
	requestsPageSize: number;
	totalRequests: number;
	setRequestsPage: (page: number) => void;
	setRequestsPageSize: (size: number) => void;

	employeesDismissed: 0 | 1;
	setEmployeesDismissed: (v: 0 | 1) => void;
}

export function useRequestTableLogic(): UseRequestTableLogicResult {
	const initialRole = localStorage.getItem('selectedRole');
	const initialActiveTab =
		initialRole === 'collaborator'
			? 'onUserRequests'
			: initialRole === 'confirmer'
				? 'confirmRequests'
				: 'userRequests';

	const [userRole, setUserRole] = useState<string | null>(initialRole);
	const [activeTab, setActiveTab] = useState<string>(initialActiveTab);
	const [viewMode, setViewMode] = useState<string>('all_time');
	const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
	const [userExecutors, setUserExecutors] = useState<IConcordant[]>([]);

	const [filters, setFilters] = useState<IFilters>({
		types: [],
		statuses: [],
		concordant: [],
		departament: [],
		roles: [],
		project: [],
		appointmentType: [],
		system: [],
		searchText: '',
		uzDateRange: [null, null],
		initiators: [],
		observers: [],
		states: [],
		executors: [],
	});

	const [userTypes, setUserTypes] = useState<IUserTypeFilter[]>([]);
	const [userStatuses, setUserStatuses] = useState<IUserStatusFilter[]>([]);
	const [userConcordant, setUserConcordant] = useState<IConcordant[]>([]);
	const [userProject, setUserProject] = useState<IUserStatusFilter[]>([]);
	const [userAppointmentType, setAppointmentType] = useState<IUserStatusFilter[]>([]);
	const [userDepartments, setUserDepartments] = useState<IUserDepartamentFilter[]>([]);
	const [userRoles, setUserRoles] = useState<IUserStatusFilter[]>([]);
	const [userSystem, setUserSystem] = useState<ISystem[]>([]);
	const [userInitiators, setUserInitiators] = useState<IConcordant[]>([]);
	const [userObservers, setUserObservers] = useState<IConcordant[]>([]);
	const [userStates, setUserStates] = useState<{ state_code: string; state_name: string }[]>([]);

	const [employees, setEmployees] = useState<ICollaboratorExtended[]>([]);
	const [employeesPage, setEmployeesPage] = useState<number>(1);
	const [employeesPageSize, setEmployeesPageSize] = useState<number>(10);
	const [totalEmployees, setTotalEmployees] = useState<number>(0);
	const [hasEmployeesData, setHasEmployeesData] = useState<boolean>(false);
	const [data, setData] = useState<IUserRequest[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [requestsPage, setRequestsPage] = useState<number>(1);
	const [requestsPageSize, setRequestsPageSize] = useState<number>(10);
	const [totalRequests, setTotalRequests] = useState<number>(0);
	const [employeesDismissed, setEmployeesDismissed] = useState<0 | 1>(0);
	const [statusesRequest] = useRequest<IApiResponse<IUserStatusFilter>>({
		...ListReqConfig,
		method: HttpMethods.GET,
		params: { ...ListReqConfig.params, code: 'RQ_getRequestStatus' },
	});
	const [typesRequest] = useRequest<IApiResponse<IUserTypeFilter>>({
		...ListReqConfig,
		method: HttpMethods.GET,
		params: { ...ListReqConfig.params, code: 'RQ_getRequestsTypes' },
	});
	const [projectFilters] = useRequest<IApiResponse<IUserStatusFilter>>({
		...ListReqConfig,
		method: HttpMethods.GET,
		params: {
			...ListReqConfig.params,
			code: 'RQ_getProjects',
		},
	});
	const [executorsRequest] = useRequest<IApiResponse<IConcordant>>({
		...ListReqConfig,
		method: HttpMethods.GET,
		params: {
			...ListReqConfig.params,
			code: 'RQ_getExecutors',
		},
	});

	const [initiatorsFilters] = useRequest<IApiResponse<IConcordant>>({
		...ListReqConfig,
		method: HttpMethods.GET,
		params: {
			...ListReqConfig.params,
			code: 'RQ_getInitiators',
		},
	});
	const [observersFilters] = useRequest<IApiResponse<IConcordant>>({
		...ListReqConfig,
		method: HttpMethods.GET,
		params: {
			...ListReqConfig.params,
			code: 'RQ_getRQObservers',
		},
	});
	const [statesFilters] = useRequest<IApiResponse<{ state_code: string; state_name: string }>>({
		...ListReqConfig,
		method: HttpMethods.GET,
		params: { ...ListReqConfig.params, code: 'RQ_getStates' },
	});
	const [concordantFilters] = useRequest<IApiResponse<IConcordant>>({
		...ListReqConfig,
		method: HttpMethods.GET,
		params: {
			...ListReqConfig.params,
			code: 'RQ_getRQConfirmers',
		},
	});
	const [projectAppointmentType] = useRequest<IApiResponse<IUserStatusFilter>>({
		...ListReqConfig,
		method: HttpMethods.GET,
		params: {
			...ListReqConfig.params,
			code: 'RQ_getAppointmentTypes',
		},
	});
	const [departamentRequest] = useRequest<IApiResponse<IUserDepartamentFilter>>({
		...ListReqConfig,
		method: HttpMethods.GET,
		params: {
			...ListReqConfig.params,
			code: 'RQ_getSubdivisions',
		},
	});
	const [rolesRequest] = useRequest<IApiResponse<IUserStatusFilter>>({
		...ListReqConfig,
		method: HttpMethods.GET,
		params: {
			...ListReqConfig.params,
			code: 'RQ_getResGroups',
		},
	});
	const [filterSystems] = useRequest<IApiResponse<ISystem>>({
		...ListReqConfig,
		method: HttpMethods.GET,
		params: {
			...ListReqConfig.params,
			code: 'RQ_generalView',
			catalog_name: 'group',
			name: 'system',
		},
	});

	const requestData = useMemo(() => {
		const [uzStart, uzEnd] = filters.uzDateRange;
		const rawData = {
			type_id: filters.types,
			status_id: filters.statuses,
			object_fio: filters.searchText,
			confirmers_id: filters.concordant,
			departaments_id: filters.departament,
			groups_id: filters.roles,
			project_ids: filters.project,
			appointments: filters.appointmentType,
			systems: filters.system,
			initiators_id: filters.initiators,
			observers_id: filters.observers,
			states_code: filters.states,
			...(uzStart && uzEnd
				? {
						uz_start_date: uzStart.format('YYYY-MM-DD'),
						uz_end_date: uzEnd.format('YYYY-MM-DD'),
					}
				: {}),
			executors_id: filters.executors,
		};
		return Object.fromEntries(
			Object.entries(rawData).filter(([_, v]) => {
				if (Array.isArray(v)) return v.length > 0;
				return v !== undefined && v !== null && v !== '';
			}),
		);
	}, [filters]);

	const [userRequestsApproval] = useRequest<IApiResponse<IUserRequest>>({
		...ListReqConfig,
		method: HttpMethods.POST,
		params: {
			...ListReqConfig.params,
			code: 'RQ_getRequests',
			role_id: userRole,
			category: activeTab,
			page_number: requestsPage,
			page_size: requestsPageSize,
			...(viewMode !== 'all_time' && dateRange[0] && dateRange[1]
				? {
						start_date: dateRange[0].format('YYYY-MM-DD'),
						end_date: dateRange[1].format('YYYY-MM-DD'),
					}
				: {}),
		},
		data: requestData,
	});

	const [fetchUserList] = useRequest<IApiResponse<ICollaboratorExtended>>({
		...ListReqConfig,
		method: HttpMethods.POST,
		params: {
			...ListReqConfig.params,
			code: 'RQ_getCollaboratorsList',
			role_id: userRole,
			page_number: employeesPage,
			page_size: employeesPageSize,
			is_dismiss: employeesDismissed,
		},
		data: requestData,
	});

	const [userRequestsGroup] = useRequest<IApiResponse<IUserRequest>>({
		...ListReqConfig,
		method: HttpMethods.POST,
		params: {
			...ListReqConfig.params,
			code: 'RQ_getProcessedByGroup',
			role_id: userRole,
			...(viewMode !== 'all_time' && dateRange[0] && dateRange[1]
				? {
						start_date: dateRange[0].format('YYYY-MM-DD'),
						end_date: dateRange[1].format('YYYY-MM-DD'),
					}
				: {}),
		},
		data: requestData,
	});

	const fetchReferenceData = useCallback(async () => {
		try {
			const context = activeTab === 'curentFlow' ? 'employees' : 'requests';

			const [
				statusesResult,
				typesResult,
				projectResult,
				concordantResult,
				appointmentTypeResult,
				departamentResult,
				systemResult,
				rolesResult,
				initiatorsResult,
				observersResult,
				statesResult,
				executorsResult,
			] = await Promise.all([
				statusesRequest(),
				typesRequest(),

				projectFilters({ params: { ...ListReqConfig.params, code: 'RQ_getProjects', context } }),
				concordantFilters(),
				projectAppointmentType({
					params: { ...ListReqConfig.params, code: 'RQ_getAppointmentTypes', context },
				}),
				departamentRequest({ params: { ...ListReqConfig.params, code: 'RQ_getSubdivisions', context } }),
				filterSystems(),
				rolesRequest({ params: { ...ListReqConfig.params, code: 'RQ_getResGroups', context } }),
				initiatorsFilters(),
				observersFilters(),
				statesFilters(),
				executorsRequest(),
			]);
			if (executorsResult?.data) setUserExecutors(executorsResult.data.result);
			if (statusesResult?.data) setUserStatuses(statusesResult.data.result);
			if (typesResult?.data) setUserTypes(typesResult.data.result);
			if (projectResult?.data) setUserProject(projectResult.data.result);
			if (concordantResult?.data) setUserConcordant(concordantResult.data.result);
			if (appointmentTypeResult?.data) setAppointmentType(appointmentTypeResult.data.result);
			if (departamentResult?.data) setUserDepartments(departamentResult.data.result);
			if (systemResult?.data) setUserSystem(systemResult.data.result);
			if (rolesResult?.data) setUserRoles(rolesResult.data.result);
			if (initiatorsResult?.data) setUserInitiators(initiatorsResult.data.result);
			if (observersResult?.data) setUserObservers(observersResult.data.result);
			if (statesResult?.data) {
				const statesWithUniqueKeys = statesResult.data.result.map((state, index) => ({
					...state,
					key: `state_${state.state_code}_${index}`,
				}));
				setUserStates(statesWithUniqueKeys);
			}
		} catch (error) {
			console.error(error);
		}
	}, [
		statusesRequest,
		typesRequest,
		projectFilters,
		concordantFilters,
		projectAppointmentType,
		departamentRequest,
		filterSystems,
		rolesRequest,
		initiatorsFilters,
		observersFilters,
		statesFilters,
		activeTab,
	]);

	const fetchTableData = useCallback(async () => {
		setLoading(true);
		try {
			if (activeTab !== 'curentFlow' && activeTab !== 'processedByGroupRequests') {
				const res = await userRequestsApproval({
					params: {
						...ListReqConfig.params,
						code: 'RQ_getRequests',
						role_id: userRole,
						category: activeTab,
						page_number: requestsPage,
						page_size: requestsPageSize,
						...(viewMode !== 'all_time' && dateRange[0] && dateRange[1]
							? {
									start_date: dateRange[0].format('YYYY-MM-DD'),
									end_date: dateRange[1].format('YYYY-MM-DD'),
								}
							: {}),
					},
					data: requestData, // <— ВАЖНО: актуальные фильтры
				});
				if (res?.data) {
					setData(res.data.result);
					setTotalRequests(res.data.total ?? 0);
				}
			} else if (activeTab === 'processedByGroupRequests') {
				const res = await userRequestsGroup({
					params: {
						...ListReqConfig.params,
						code: 'RQ_getProcessedByGroup',
						role_id: userRole,
						...(viewMode !== 'all_time' && dateRange[0] && dateRange[1]
							? {
									start_date: dateRange[0].format('YYYY-MM-DD'),
									end_date: dateRange[1].format('YYYY-MM-DD'),
								}
							: {}),
					},
					data: requestData, // <— ВАЖНО: актуальные фильтры
				});
				if (res?.data) {
					setData(res.data.result);
					setTotalRequests(res.data.total ?? 0);
				}
			}
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	}, [
		activeTab,
		dateRange,
		requestData,
		requestsPage,
		requestsPageSize,
		userRole,
		userRequestsApproval,
		userRequestsGroup,
		viewMode,
	]);

	const fetchEmployeesWithPagination = useCallback(async () => {
		setLoading(true);
		try {
			const response = await fetchUserList({
				params: {
					...ListReqConfig.params,
					code: 'RQ_getCollaboratorsList',
					role_id: userRole,
					page_number: employeesPage,
					page_size: employeesPageSize,
					is_dismiss: employeesDismissed,
				},
				data: requestData,
			});
			if (response?.data) {
				setHasEmployeesData(response.data.result.length > 0);
				setEmployees(response.data.result);
				setTotalEmployees(response.data.total ?? 0);
			}
		} finally {
			setLoading(false);
		}
	}, [fetchUserList, employeesPage, employeesPageSize, userRole, requestData]);

	useEffect(() => {
		fetchReferenceData();
	}, [activeTab]);

	useEffect(() => {
		if (activeTab === 'curentFlow') {
			fetchEmployeesWithPagination();
		} else {
			fetchTableData();
		}
	}, [
		activeTab,
		viewMode,
		dateRange,
		filters,
		userRole,
		employeesPage,
		employeesPageSize,
		requestsPage,
		requestsPageSize,
		employeesDismissed,
	]);

	useEffect(() => {
		// Предварительно загружаем данные сотрудников при выборе роли "согласующий"
		if (userRole === 'confirmer') {
			fetchEmployeesWithPagination();
		}
	}, [userRole]);

	const setFilter = useCallback(<K extends keyof IFilters>(filter: K, value: IFilters[K]) => {
		setFilters((f) => ({ ...f, [filter]: value }));
	}, []);

	const handleRoleChange = useCallback((role: string) => {
		localStorage.setItem('selectedRole', role);
		setUserRole(role);
		setActiveTab(
			role === 'collaborator' ? 'onUserRequests' : role === 'confirmer' ? 'confirmRequests' : 'userRequests',
		);
	}, []);

	const currentRoleTabs = useMemo(() => {
		if (!userRole || !ROLE_TABS_CONFIG[userRole]) return [];
		// Удаляем условие, которое фильтрует вкладку "Подключенные сотрудники" для согласующего
		return ROLE_TABS_CONFIG[userRole];
	}, [userRole]);

	const prevActiveTabRef = useRef<string>(activeTab);

	useEffect(() => {
		const wasCurrentFlow = prevActiveTabRef.current === 'curentFlow';
		const isCurrentFlow = activeTab === 'curentFlow';

		if (wasCurrentFlow !== isCurrentFlow) {
			setFilters({
				types: [],
				statuses: [],
				concordant: [],
				departament: [],
				roles: [],
				project: [],
				appointmentType: [],
				system: [],
				searchText: '',
				uzDateRange: [null, null],
				initiators: [],
				observers: [],
				states: [],
				executors: [],
			});
			setEmployeesDismissed(0);
			setEmployeesPage(1);
		}

		prevActiveTabRef.current = activeTab;
	}, [activeTab]);
	const columns: ColumnsType<IUserRequest> = useMemo(
		() => [
			{
				title: 'Номер (код)',
				dataIndex: 'code',
				key: 'code',
			},
			{
				title: 'Дата подачи',
				dataIndex: 'create_date',
				key: 'create_date',
			},
			{
				title: 'Тип заявки',
				dataIndex: 'type_name',
				key: 'type_name',
			},
		],
		[],
	);

	return {
		userRole,
		activeTab,
		setActiveTab,
		currentRoleTabs,
		loading,
		data,
		columns,
		filters,
		setFilter,
		handleRoleChange,
		viewMode,
		dateRange,
		setViewMode,
		setDateRange,
		userTypes,
		userStatuses,
		userConcordant,
		userProject,
		userAppointmentType,
		userDepartments,
		userRoles,
		userSystem,
		userInitiators,
		userObservers,
		userStates,
		employees,
		employeesPage,
		employeesPageSize,
		totalEmployees,
		setEmployeesPage,
		setEmployeesPageSize,
		setData,
		userExecutors,
		requestsPage,
		requestsPageSize,
		totalRequests,
		setRequestsPage,
		setRequestsPageSize,
		employeesDismissed,
		setEmployeesDismissed,
	};
}
