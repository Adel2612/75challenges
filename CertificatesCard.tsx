import { ReactNode, useCallback, useMemo, useState } from 'react';

import { Card, Collapse, Segmented, Table, Tabs } from 'antd';

import { getColumns } from './components/columns';
import EmployeeTable from './components/EmployeeTable/Collaborator';
import { ICollaboratorExtended } from './components/EmployeeTable/models/EmployeeTable.models';
import RequestFilters from './components/Filter/FilterTable';

import { useRequestTableLogic } from './hooks/useRequestTableLogic';

import { STYLES } from './styles/styles';

import ApplicationsCard from '../ApplicationsCard/ApplicationCard';
import ApplicationHeader from '../HeaderModal/FilterRole';

function RequestTableCard(): ReactNode {
	const logic = useRequestTableLogic();
	const [editingEmployee, setEditingEmployee] = useState<ICollaboratorExtended | null>(null);
	const [editModalOpen, setEditModalOpen] = useState(false);

	const handleRowClick = useCallback((record: (typeof logic.data)[number]): void => {
		const baseUrl = window.parent.location.href.split('?')[0];
		window.parent.location.href = `${baseUrl}?request_id=${record.id}`;
	}, []);

	const columns = useMemo(
		() => getColumns({ showExecutor: logic.activeTab === 'processedByGroupRequests' }),
		[logic.activeTab],
	);

	const handleEditEmployee = (employee: ICollaboratorExtended) => {
		setEditingEmployee(employee);
		setEditModalOpen(true);
	};

	const handleEditModalClosed = () => {
		setEditModalOpen(false);
		setEditingEmployee(null);
	};

	const tabItems = useMemo(() => {
		return logic.currentRoleTabs.map((tab) => {
			const isCollaboratorsTab = tab.key === 'curentFlow';
			return {
				key: tab.key,
				label: tab.title,
				children: (
					<>
						{isCollaboratorsTab ? (
							<>
								{/* Верхняя панель только для вкладки сотрудников */}
								<div
									style={{
										display: 'flex',
										justifyContent: 'space-between',
										alignItems: 'center',
										marginBottom: 12,
									}}
								>
									<Segmented
										options={[
											{ label: 'Действующие', value: 0 },
											{ label: 'Уволенные', value: 1 },
										]}
										value={logic.employeesDismissed}
										onChange={(v) => {
											logic.setEmployeesDismissed(v as 0 | 1);
											logic.setEmployeesPage(1);
										}}
									/>
								</div>

								<EmployeeTable
									data={logic.employees}
									loading={logic.loading}
									current={logic.employeesPage}
									pageSize={logic.employeesPageSize}
									total={logic.totalEmployees}
									onEditEmployee={handleEditEmployee}
									onPaginationChange={(page, pageSize) => {
										logic.setEmployeesPage(page);
										logic.setEmployeesPageSize(pageSize);
									}}
								/>
							</>
						) : (
							<>
								{/* Верхняя панель только для вкладок заявок */}
								{logic.userRole !== 'collaborator' && logic.userRole !== 'confirmer' && (
									<div
										style={{
											display: 'flex',
											justifyContent: 'flex-end',
											alignItems: 'center',
											marginBottom: 12,
										}}
									>
										<ApplicationsCard
											onRequestCreated={() => {
												logic.setData([]);
											}}
											initialEmployee={editingEmployee}
											openEditModal={editModalOpen}
											onEditModalClosed={handleEditModalClosed}
										/>
									</div>
								)}
								<Table
									columns={columns}
									dataSource={logic.data}
									rowKey="id"
									loading={logic.loading}
									pagination={{
										current: logic.requestsPage,
										pageSize: logic.requestsPageSize,
										total: logic.totalRequests,
										showSizeChanger: true,
										pageSizeOptions: ['5', '10', '20', '50', '100'],
										showTotal: (total, [from, to]) => (
											<span>{`Показано ${from}-${to} из ${total} заявок`}</span>
										),
										onChange: (page, pageSize) => {
											logic.setRequestsPage(page);
											logic.setRequestsPageSize(pageSize);
										},
									}}
									onRow={(record) => ({
										onClick: () => handleRowClick(record),
									})}
								/>
							</>
						)}
					</>
				),
			};
		});
	}, [
		logic.currentRoleTabs,
		logic.userRole,
		logic.employees,
		logic.loading,
		logic.employeesPage,
		logic.employeesPageSize,
		logic.data,
		columns,
		handleRowClick,
		editingEmployee,
		editModalOpen,
		logic.employeesDismissed,
		logic.totalEmployees,
	]);

	return (
		<div style={STYLES.container}>
			<ApplicationHeader
				onRoleChange={logic.handleRoleChange}
				onDateAndModeChange={(mode, dates) => {
					logic.setViewMode(mode);
					logic.setDateRange(dates);
				}}
			/>
			<Collapse
				defaultActiveKey={[]}
				style={STYLES.collapse}
				items={[
					{
						key: '1',
						label: <span style={STYLES.panelHeader}>Фильтры</span>,
						children: (
							<RequestFilters
								activeTab={logic.activeTab}
								searchText={logic.filters.searchText}
								handleSearchChange={(e) => logic.setFilter('searchText', e.target.value)}
								userTypes={logic.userTypes}
								selectedTypes={logic.filters.types}
								handleTypeChange={(v) => logic.setFilter('types', v)}
								userStatuses={logic.userStatuses}
								selectedStatuses={logic.filters.statuses}
								handleStatusChange={(v) => logic.setFilter('statuses', v)}
								userConcordant={logic.userConcordant}
								selectedConcordant={logic.filters.concordant}
								handleConcordantChange={(v) => logic.setFilter('concordant', v)}
								userProject={logic.userProject}
								selectedProject={logic.filters.project}
								handleProjectChange={(v) => logic.setFilter('project', v)}
								userDepartments={logic.userDepartments}
								selectedDepartament={logic.filters.departament}
								handleDepartamentChange={(v) => logic.setFilter('departament', v)}
								userAppointmentType={logic.userAppointmentType}
								selectedAppointmentType={logic.filters.appointmentType}
								handleAppointmentTypeChange={(v) => logic.setFilter('appointmentType', v)}
								userRoles={logic.userRoles}
								selectedRoles={logic.filters.roles}
								handleRolesChange={(v) => logic.setFilter('roles', v)}
								userSystem={logic.userSystem}
								selectedSystem={logic.filters.system}
								handleSystemChange={(v) => logic.setFilter('system', v)}
								uzDateRange={logic.filters.uzDateRange}
								handleUzDateRangeChange={(dates) => logic.setFilter('uzDateRange', dates)}
								userInitiators={logic.userInitiators}
								selectedInitiators={logic.filters.initiators}
								handleInitiatorsChange={(v) => logic.setFilter('initiators', v)}
								userObservers={logic.userObservers}
								selectedObservers={logic.filters.observers}
								handleObserversChange={(v) => logic.setFilter('observers', v)}
								userStates={logic.userStates}
								selectedStates={logic.filters.states}
								handleStatesChange={(v) => logic.setFilter('states', v)}
								userExecutors={logic.userExecutors}
								selectedExecutors={logic.filters.executors}
								handleExecutorsChange={(v) => logic.setFilter('executors', v)}
							/>
						),
						style: STYLES.panel,
					},
				]}
			/>
			<Card style={STYLES.card}>
				{logic.userRole && (
					<Tabs
						activeKey={logic.activeTab}
						onChange={logic.setActiveTab}
						items={tabItems}
					/>
				)}
			</Card>
		</div>
	);
}

export default RequestTableCard;
