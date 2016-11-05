/**
 * Created by hb on 18.08.16.
 */

// mongoose mit ES6-Promise
// ausserdem wird das gebraucht: (<any> mongoose).Promise = Promise;
type MongoosePromise<T> = Promise<T>;
