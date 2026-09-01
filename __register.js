const Movi = {};

function register(factory) {
    Object.assign(Movi, factory());
}
