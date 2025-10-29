// EmployeeTable.tsx
import React, { useCallback, useMemo, useState } from 'react';

import { Avatar, Button, Table, Tag, Tooltip } from 'antd';

import { CaretDownOutlined, CaretRightOutlined, EditOutlined } from '@ant-design/icons';

import EmployeeRowExpanded from './components/EmployeeRowExpanded';

import { getInitials, ICollaboratorExtended } from './models/EmployeeTable.models';

interface EmployeeTableProps {
	data: ICollaboratorExtended[];
	loading: boolean;
	current: number;
	pageSize: number;
	total: number; // NEW
	onPaginationChange: (page: number, pageSize: number) => void;
	onEditEmployee?: (employee: ICollaboratorExtended) => void;
}

const STATUS_MAP = {
	Действующий: {
		backgroundColor: '#F6FFED',
		borderColor: '#B7EB8F',
		textColor: '#52C41A',
	},
	Уволенный: {
		backgroundColor: '#FFF1F0',
		borderColor: '#FFA39E',
		textColor: '#FF4D4F',
	},
} as const;

const EmployeeTable: React.FC<EmployeeTableProps> = ({
	data,
	loading,
	current,
	pageSize,
	total, // NEW
	onPaginationChange,
	onEditEmployee,
}) => {
	const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
	const parseDate = (str: string) => {
		// Если нет даты, присваиваем максимально возможную дату для сортировки в конец
		if (!str) return new Date(9999, 11, 31); // 31 декабря 9999 года
		const [day, month, year] = str.split('.').map(Number);
		return new Date(year, month - 1, day);
	};

	const columns = useMemo(
		() => [
			{
				title: 'ФИО',
				dataIndex: 'fullname',
				key: 'fullname',
				render: (text: string, record: ICollaboratorExtended) => (
					<div style={{ display: 'flex', alignItems: 'center' }}>
						<div style={{ minWidth: 32, width: 32, height: 32, flexShrink: 0 }}>
							<Avatar
								src={record.pict_url}
								style={{ borderRadius: '50%', width: '100%', height: '100%' }}
							>
								{!record.pict_url && getInitials(record.fullname)}
							</Avatar>
						</div>
						<div style={{ marginLeft: 10, overflow: 'hidden', textOverflow: 'ellipsis' }}>
							<div>{record.fullname}</div>
							<div style={{ color: '#999' }}>{record.position_name}</div>
						</div>
					</div>
				),
			},
			{
				title: 'Подразделение',
				dataIndex: 'position_parent_name',
				key: 'position_parent_name',
				sorter: (a: ICollaboratorExtended, b: ICollaboratorExtended) =>
					a.position_parent_name.localeCompare(b.position_parent_name),
			},
			{
				title: 'Должность',
				dataIndex: 'position_name',
				key: 'position_name',
				sorter: (a: ICollaboratorExtended, b: ICollaboratorExtended) =>
					a.position_name.localeCompare(b.position_name),
			},
			{
				title: 'Область',
				dataIndex: 'region',
				key: 'region',
				sorter: (a: ICollaboratorExtended, b: ICollaboratorExtended) => a.region.localeCompare(b.region),
			},
			{
				title: 'Место работы',
				dataIndex: 'place',
				key: 'place',
				sorter: (a: ICollaboratorExtended, b: ICollaboratorExtended) => a.place.localeCompare(b.place),
			},
			{
				title: 'Срок действия УЗ',
				dataIndex: 'uz_date',
				key: 'uz_date',
				sorter: (a: ICollaboratorExtended, b: ICollaboratorExtended) =>
					parseDate(a.uz_date).getTime() - parseDate(b.uz_date).getTime(),
				filters: [
					{ text: 'С датой', value: 'with-date' },
					{ text: 'Без даты', value: 'without-date' },
				],
				onFilter: (value, record: ICollaboratorExtended) => {
					if (value === 'with-date') return !!record.uz_date;
					if (value === 'without-date') return !record.uz_date;
					return true;
				},
				render: (value?: string) =>
					value ? (
						value
					) : (
						<span
							style={{
								background: '#fafafa',
								border: '1px solid #d9d9d9',
								color: '#8c8c8c',
								borderRadius: 4,
								padding: '0 8px',
								lineHeight: '22px',
								display: 'inline-block',
							}}
						>
							Без даты
						</span>
					),
			},

			{
				title: 'Статус',
				dataIndex: 'status',
				key: 'status',
				sorter: (a: ICollaboratorExtended, b: ICollaboratorExtended) => a.status.localeCompare(b.status),
				render: (status: string) => {
					const s = STATUS_MAP[status as keyof typeof STATUS_MAP] || {
						backgroundColor: '#FAFAFA',
						borderColor: '#D9D9D9',
						textColor: '#8C8C8C',
					};
					return (
						<div>
							<span
								style={{
									backgroundColor: s.backgroundColor,
									border: `1px solid ${s.borderColor}`,
									color: s.textColor,
									borderRadius: 4,
									padding: '1px 8px',
									width: 100,
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									textAlign: 'center',
									whiteSpace: 'normal',
								}}
							>
								{status}
							</span>
						</div>
					);
				},
			},
			{
				title: '',
				key: 'action',
				width: 50,
				render: (_: unknown, record: ICollaboratorExtended) => (
					<Tooltip title="Редактировать">
						<Button
							type="text"
							icon={<EditOutlined />}
							onClick={(e) => {
								e.stopPropagation();
								onEditEmployee?.(record);
							}}
						/>
					</Tooltip>
				),
			},
		],
		[onEditEmployee],
	);

	const expandedRowRender = useCallback(
		(record: ICollaboratorExtended) => <EmployeeRowExpanded record={record} />,
		[],
	);

	const onExpand = useCallback((expanded: boolean, record: ICollaboratorExtended) => {
		setExpandedRowKeys(expanded ? [record.id] : []);
	}, []);

	return (
		<div className="employee-table-container">
			<Table<ICollaboratorExtended>
				columns={columns}
				dataSource={data}
				rowKey="id"
				expandable={{
					expandedRowRender,
					expandedRowKeys,
					onExpand,
					expandIcon: ({ expanded, onExpand, record }) =>
						expanded ? (
							<CaretDownOutlined onClick={(e) => onExpand(record, e)} />
						) : (
							<CaretRightOutlined onClick={(e) => onExpand(record, e)} />
						),
				}}
				loading={loading}
				pagination={{
					current,
					pageSize,
					total,
					showSizeChanger: true,
					pageSizeOptions: ['5', '10', '20', '50', '100'],
					onChange: onPaginationChange,
					onShowSizeChange: onPaginationChange,
					showTotal: (t, range) => `Показано ${range[0]}-${range[1]} из ${t} сотрудников`,
				}}
			/>
		</div>
	);
};

export default EmployeeTable;
