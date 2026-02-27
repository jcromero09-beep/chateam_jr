// Simple i18n mock for legacy components
// This provides basic translation functionality for components that expect it

const messages = {
  en: {
    translations: {
      flowBuilder: {
        addText: "Add Text",
        editText: "Edit Text",
        addMenu: "Add Menu",
        editMenu: "Edit Menu",
        save: "Save",
        cancel: "Cancel",
        delete: "Delete",
        add: "Add",
        name: "Name",
        message: "Message",
        options: "Options",
      },
    },
  },
  es: {
    translations: {
      flowBuilder: {
        addText: "Agregar Texto",
        editText: "Editar Texto",
        addMenu: "Agregar Menú",
        editMenu: "Editar Menú",
        save: "Guardar",
        cancel: "Cancelar",
        delete: "Eliminar",
        add: "Agregar",
        name: "Nombre",
        message: "Mensaje",
        options: "Opciones",
      },
    },
  },
  pt: {
    translations: {
      flowBuilder: {
        addText: "Adicionar Texto",
        editText: "Editar Texto",
        addMenu: "Adicionar Menu",
        editMenu: "Editar Menu",
        save: "Salvar",
        cancel: "Cancelar",
        delete: "Excluir",
        add: "Adicionar",
        name: "Nome",
        message: "Mensagem",
        options: "Opções",
      },
    },
  },
};

class I18n {
  constructor() {
    this.language = localStorage.getItem("i18nextLng") || "es";
  }

  t(key) {
    const keys = key.split(".");
    let value = messages[this.language]?.translations;

    for (const k of keys) {
      value = value?.[k];
      if (!value) break;
    }

    return value || key;
  }
}

export const i18n = new I18n();
