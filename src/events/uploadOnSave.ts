import isDirectory from "is-directory"
import path from "path"
import { getAllowFiles, getRootPath, verityConfig, isUpRoot } from "../utils"
import * as vscode from "vscode"
import { opType, FileTransferConfigItem } from "../types/config"
import FileTransfer from "../FileTransfer"

function toPosixRel(root: string, file: string): string {
	return path.relative(root, file).split(path.sep).join("/")
}

export const uploadOnSave = async (
	config: FileTransferConfigItem,
	file: string,
	opType: opType
) => {
	const rootPath = getRootPath(file)
	// 初始化该环境名的任务队列与连接池（构造函数副作用）
	void new FileTransfer(config)
	try {
		const { type } = config
		await verityConfig(config)
		let remoteFilePath = toPosixRel(rootPath, file)
		if (type != "ftp") {
			remoteFilePath = path.posix.join(
				config.remotePath.replace(/\/+$/, "") || "/",
				toPosixRel(rootPath, file)
			)
		}
		switch (opType.op) {
			case "add":
			case "edit":
				await uploadFile(file, remoteFilePath)
				break
			case "rename":
				if (!opType.newname) {
					return
				}
				let remotePath = toPosixRel(rootPath, opType.newname)
				let localPath = toPosixRel(rootPath, file)
				if (config.type !== "ftp") {
					remotePath = path.posix.join(
						config.remotePath.replace(/\/+$/, "") || "/",
						toPosixRel(rootPath, opType.newname)
					)
					localPath = path.posix.join(
						config.remotePath.replace(/\/+$/, "") || "/",
						toPosixRel(rootPath, file)
					)
				}
				await FileTransfer.addTask({
					config: config,
					localPath,
					remotePath: path.posix.join("/", remotePath),
					fileType: opType.type,
					operationType: "rename",
				}, true)
				break
			case "delete":
				await FileTransfer.addTask(
					{
						config: config,
						localPath: file,
						remotePath: path.posix.join("/", remoteFilePath),
						fileType: opType.type,
						operationType: "delete",
					},
					true
				)
				break
			default:
				break
		}
	} catch (err) {
		const msg = `[${config.name}][${config.type}][上传失败]`
		vscode.window.showErrorMessage(`${msg}：${err?.toString()}`)
	}

	async function uploadFile(file: string, remotePath: string) {
		const { up_to_root, remotePath: newRemotePath } = isUpRoot(config, remotePath, rootPath)

		if (!isDirectory.sync(file)) {
			const newPath = up_to_root ? newRemotePath : remotePath
			await FileTransfer.addTask({
				config: config,
				localPath: file,
				remotePath: path.posix.join("/", newPath),
				operationType: "upload",
			})
		} else {
			const files = await getAllowFiles(config, file)
			if (files && files.length) {
				for (const vv of files) {
					let rp: string
					if (up_to_root) {
						rp = path.posix.join(newRemotePath, toPosixRel(rootPath, vv))
					} else {
						rp = path.relative(config.type !== "ftp" ? config.remotePath : "", path.relative(rootPath, vv)).split(path.sep).join("/")
					}
					await FileTransfer.addTask({
						config: config,
						localPath: vv,
						remotePath: path.posix.join("/", rp),
						operationType: "upload",
					})
				}
			}
		}
	}
}
