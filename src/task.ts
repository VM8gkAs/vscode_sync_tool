import { Task } from './types/config';

export function cloneTask(task: Task, overrides: Partial<Task> = {}): Task {
	const fileChunks = overrides.fileChunks ?? task.fileChunks;

	return {
		...task,
		...overrides,
		config: overrides.config ?? task.config,
		fileChunks: fileChunks?.map(chunk => ({ ...chunk }))
	};
}
