function example(){
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve("example");
        }, 1000);
    });
}