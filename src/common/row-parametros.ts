"use strict";
import {field, rowDefinition} from "./engine"; 

const campos = {
    unico_registro: new field.boolean({default:true}),
}

export const parametros = rowDefinition({
    name:'parametros',
    elementName:'parámetros',
    colectionName:'parámetros',
    field:campos,
    primaryKey:['unico_registro']
});
