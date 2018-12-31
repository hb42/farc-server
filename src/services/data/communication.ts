export interface Communication {
  msg: string;
  payload: any;
}

export const ipcREADALL = "readall";
export const ipcREADFS = "readfilesystem";
export const ipcREADVORM = "readvormerk";
export const ipcREADTREE = "readtree";
export const ipcVORMREADY = "vormerkready";
export const ipcEXEC = "exec";
export const ipcEXECRES = "execresult";
