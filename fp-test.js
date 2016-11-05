var R = require('ramda');

var ident = (a) => a;
var show = (a) => { console.log(a); return a; };
var debug = (a) => { console.dir(a); return a; };

var addStr = R.curry((s1, s2) => s1 + s2);
var plus = addStr('+++');

var Wrapper = function(val) {
  this.val = val;
};
Wrapper.prototype.map = function(f) { return f(this.val); };
Wrapper.prototype.fmap = function(f) { return wrap(f(this.val)); };

var wrap = (val) => new Wrapper(val);

var wrapped = wrap('jaja');
// console.dir(wrapped);

// console.dir(wrapped.map(R.identity));

// debug(wrapped.fmap(plus));
// debug(wrapped);

wrapped.fmap(plus).fmap(show);
debug(wrapped.fmap(R.compose(plus, show)).map(R.identity));

var Empty = function() {;};
Empty.prototype.map = function() { return this; };

var empty = new Empty();


class Id {
  constructor(value) {
    this._value = value;
  }
  get value() {
    return this._value;
  }
  static of(a) {
    return new Id(a);
  }
  map(f) {
    return Id.of( f(this.value) );
  }
  join() {
    if(!(this.value instanceof Id)) {
      return this;
    } else {
      return this.value.join();
    }
  }
  toString() {
    return 'Id [' + this.value + ']';
  }
}

debug (R.Either.of('test'));
