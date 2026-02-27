// Wildcard module declaration for toastError
declare module '*/errors/toastError' {
  const toastError: (err: any) => void;
  export default toastError;
}
