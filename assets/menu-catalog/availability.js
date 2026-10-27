/* Menu availability. Exports toggleAvailable; reads injected store, updateItem and itemById. */
(function (parts) {
  parts.availability = function ({ store, updateItem, itemById }) {
  const toggleAvailable = (id) => {
      const it = itemById(store.get(), id);
      if (it) updateItem(id, { avail: it.avail === false });
    };
    return { toggleAvailable };
  };
})(window.KiwiMenuCatalogParts = window.KiwiMenuCatalogParts || {});
