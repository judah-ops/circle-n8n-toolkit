import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

const BASE_URL = 'https://app.circle.so/api/v1';

export class Circle implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Circle',
		name: 'circle',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with the Circle.so API',
		defaults: { name: 'Circle' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'circleApi',
				required: true,
			},
		],
		properties: [
			// ── Resource ────────────────────────────────────────────
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Member', value: 'member' },
				],
				default: 'member',
			},
			// ── Operation: Member ───────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['member'] },
				},
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Get a member by ID or email',
						action: 'Get a member',
					},
				],
				default: 'get',
			},
			// ── Fields: Member → Get ────────────────────────────────
			{
				displayName: 'Member ID or Email',
				name: 'memberId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: { resource: ['member'], operation: ['get'] },
				},
				description: 'The numeric ID or email address of the member to retrieve',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('circleApi');

		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;

			if (resource === 'member' && operation === 'get') {
				const memberId = this.getNodeParameter('memberId', i) as string;

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'circleApi',
					{
						method: 'GET',
						url: `${BASE_URL}/community_members/${encodeURIComponent(memberId)}`,
						qs: { community_id: credentials.communityId as number },
					},
				);

				returnData.push({ json: response as IDataObject });
			}
		}

		return [returnData];
	}
}
