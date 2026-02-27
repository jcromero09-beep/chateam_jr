import { toast } from "react-toastify";

const toastError = (err) => {
  const errorMsg = err.response?.data?.error || err.message || "An error occurred";

  if (errorMsg) {
    toast.error(errorMsg, {
      position: "top-right",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
  }
};

export default toastError;
